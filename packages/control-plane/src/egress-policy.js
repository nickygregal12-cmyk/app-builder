/**
 * What "public egress" is allowed to mean.
 *
 * `network=none` is the default and the proven profile. A few roles — research,
 * brand research, source ingestion — have policies that genuinely allow
 * `network.public`, and those attempts need the public internet. They must not
 * get it by being given the host's network.
 *
 * This module is the executable definition of the difference. It classifies a
 * destination and refuses everything that is *not* the public internet: the
 * Factory control plane, host loopback, every private range, link-local and
 * the cloud metadata address that lives in it, unique-local IPv6, carrier-grade
 * NAT, and the IPv4-mapped and integer spellings of all of them.
 *
 * The last part is why this is code rather than a list in a shell script.
 * `127.0.0.1`, `127.1`, `0x7f.1`, `2130706433`, `::ffff:127.0.0.1` and
 * `[::1]` are the same destination, and a filter that only knows the first
 * spelling is a filter a task can walk around. Every form below is one that
 * has been used in the wild to defeat exactly this kind of allow-list.
 *
 * The hosted enforcement is separate and is the operator's:
 * `ops/hetzner/install-egress-network.sh` builds the bounded network and
 * `ops/hetzner/verify-egress-profile.sh` proves these refusals from inside a
 * real container. This module is what the verifier's target list is derived
 * from, so the two cannot drift.
 */

export const FORBIDDEN_EGRESS_CLASSES = Object.freeze([
  'factory-control-plane',
  'loopback',
  'private',
  'link-local',
  'metadata',
  'unique-local',
  'carrier-grade-nat',
  'unspecified',
  'multicast',
  'reserved',
  'host-address',
  'unparseable',
]);

/** Named because it is the destination this whole boundary exists to refuse. */
export const FACTORY_CONTROL_PORTS = Object.freeze([4310, 4096, 4097]);

/**
 * Every spelling of an IPv4 address a resolver or a socket library will accept.
 * Returns the 32-bit value, or null when the text is not an IPv4 literal.
 */
function ipv4Value(text) {
  const parts = String(text).split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const numbers = [];
  for (const part of parts) {
    if (part === '') return null;
    let value;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = Number.parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) value = Number.parseInt(part.slice(1), 8);
    else if (/^\d+$/.test(part)) value = Number.parseInt(part, 10);
    else return null;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    numbers.push(value);
  }
  // `127.1` and `2130706433` are `127.0.0.1`. inet_aton treats the final part
  // as the remaining low-order bytes, and so must anything claiming to filter.
  const last = numbers.pop();
  const maximumLast = 2 ** (8 * (4 - numbers.length));
  if (last >= maximumLast) return null;
  if (numbers.some((value) => value > 255)) return null;
  let result = last;
  for (const [index, value] of numbers.entries()) result += value * 2 ** (8 * (3 - index));
  return result >>> 0;
}

function inRange(value, cidrStart, prefix) {
  const start = ipv4Value(cidrStart);
  if (start === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (start & mask) >>> 0;
}

const IPV4_FORBIDDEN = Object.freeze([
  ['0.0.0.0', 8, 'unspecified'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-grade-nat'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.169.254', 32, 'metadata'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'reserved'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'reserved'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
]);

function normaliseIpv6(text) {
  return String(text).replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

/**
 * The 32-bit value behind an IPv4-mapped IPv6 address, in either spelling.
 *
 * `::ffff:127.0.0.1` and `::ffff:7f00:1` are the same destination, and the
 * second is the one that actually arrives: every URL parser normalises the
 * dotted tail into hex pairs, so a filter that only knew the dotted form was a
 * filter nothing ever reached in the dotted form. `[::ffff:a9fe:a9fe]` is the
 * cloud metadata address, and it classified as public until this existed.
 *
 * Returns null when the text is not an IPv4-mapped address, so a genuine IPv6
 * destination falls through to the IPv6 rules below rather than being coerced.
 */
function ipv4MappedValue(text) {
  const address = normaliseIpv6(text);
  const mapped = /^::ffff:(?:0:)?([0-9a-f.:]+)$/.exec(address);
  if (!mapped) return null;
  const dotted = ipv4Value(mapped[1]);
  if (dotted !== null) return dotted;
  const groups = mapped[1].split(':');
  if (groups.length > 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const [high, low] = groups.length === 2 ? groups : ['0', groups[0]];
  return (((Number.parseInt(high, 16) * 65536) + Number.parseInt(low, 16)) >>> 0);
}

function classifyIpv6(text) {
  const address = normaliseIpv6(text);
  if (!address.includes(':')) return null;
  // An IPv4-mapped address is an IPv4 destination wearing an IPv6 spelling.
  const mapped = ipv4MappedValue(address);
  if (mapped !== null) return classifyIpv4Value(mapped);
  if (address === '::1') return 'loopback';
  if (address === '::') return 'unspecified';
  if (/^fe[89ab][0-9a-f]:/.test(address)) return 'link-local';
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return 'unique-local';
  if (/^ff[0-9a-f]{2}:/.test(address)) return 'multicast';
  if (address === 'fd00:ec2::254') return 'metadata';
  return 'public';
}

function classifyIpv4Value(value) {
  for (const [start, prefix, kind] of IPV4_FORBIDDEN) {
    if (inRange(value, start, prefix)) return kind;
  }
  return 'public';
}

/**
 * Classify one destination.
 *
 * A hostname that is not an IP literal classifies as `dns-name`: whether it
 * resolves somewhere forbidden is a question only the resolver can answer, and
 * it is answered at connection time by the hosted egress filter, not here.
 * Reporting it as `public` would be the mistake that makes DNS rebinding work.
 */
export function classifyEgressDestination(destination, { hostAddresses = [] } = {}) {
  const raw = String(destination ?? '').trim();
  if (!raw) return { destination: raw, classification: 'unparseable', allowed: false };

  // An IPv4-mapped address is resolved to its IPv4 value first, so the
  // host-address rule below applies to it as well. Without this,
  // `[::ffff:<the host's own public address>]` would be the one spelling of the
  // factory host that walked past its own boundary.
  const ipv4 = ipv4MappedValue(raw) ?? ipv4Value(raw);
  const ipv6 = ipv4 === null ? classifyIpv6(raw) : null;
  if (ipv6 !== null) return { destination: raw, classification: ipv6, allowed: ipv6 === 'public' };

  if (ipv4 !== null) {
    const classification = classifyIpv4Value(ipv4);
    // The host's own global addresses are public addresses, and still off
    // limits: reaching the factory host from its own sandbox is the bypass,
    // whichever address it wears.
    if (classification === 'public' && hostAddresses.some((address) => ipv4Value(address) === ipv4)) {
      return { destination: raw, classification: 'host-address', allowed: false };
    }
    return { destination: raw, classification, allowed: classification === 'public' };
  }

  const name = raw.toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost') || name === 'ip6-localhost') {
    return { destination: raw, classification: 'loopback', allowed: false };
  }
  if (name === 'host.containers.internal' || name === 'host.docker.internal' || name === 'gateway.docker.internal') {
    return { destination: raw, classification: 'factory-control-plane', allowed: false };
  }
  if (name === 'metadata.google.internal' || name === 'metadata.goog') {
    return { destination: raw, classification: 'metadata', allowed: false };
  }
  return { destination: raw, classification: 'dns-name', allowed: false, resolutionRequired: true };
}

/**
 * The one decision. Refuses with a named class rather than a boolean, because
 * an egress refusal an operator cannot explain is an egress refusal nobody
 * will trust.
 */
export function assertPublicEgressDestination(destination, { hostAddresses = [], resolvedAddresses = null } = {}) {
  const verdict = classifyEgressDestination(destination, { hostAddresses });
  if (verdict.classification === 'dns-name') {
    if (resolvedAddresses === null) {
      throw new Error(`Refusing egress to ${destination}: a name must be resolved before it can be allowed, or the filter can be walked around by DNS.`);
    }
    if (resolvedAddresses.length === 0) throw new Error(`Refusing egress to ${destination}: it resolved to nothing.`);
    for (const address of resolvedAddresses) {
      const resolved = classifyEgressDestination(address, { hostAddresses });
      if (!resolved.allowed) {
        throw new Error(`Refusing egress to ${destination}: it resolves to ${address}, which is ${resolved.classification}.`);
      }
    }
    return { destination, classification: 'public', allowed: true, resolvedAddresses };
  }
  if (!verdict.allowed) throw new Error(`Refusing egress to ${destination}: ${verdict.classification}.`);
  return verdict;
}

/**
 * The destinations a hosted egress verifier must attempt and fail to reach.
 *
 * Generated rather than listed twice, so the shell verifier and this module
 * cannot disagree about what "must not be reachable" means.
 */
export function forbiddenEgressProbeTargets({ hostAddresses = [], factoryPort = 4310 } = {}) {
  const targets = [
    { host: '127.0.0.1', port: factoryPort, why: 'factory control plane on loopback' },
    { host: 'localhost', port: factoryPort, why: 'factory control plane by name' },
    { host: '::1', port: factoryPort, why: 'factory control plane over IPv6 loopback' },
    { host: 'host.containers.internal', port: factoryPort, why: 'the container runtime gateway alias' },
    { host: 'host.docker.internal', port: factoryPort, why: 'the other gateway alias' },
    { host: '169.254.169.254', port: 80, why: 'cloud instance metadata' },
    { host: '10.0.0.1', port: 22, why: 'RFC1918 10/8' },
    { host: '172.16.0.1', port: 22, why: 'RFC1918 172.16/12' },
    { host: '192.168.0.1', port: 22, why: 'RFC1918 192.168/16' },
    { host: '100.100.100.100', port: 22, why: 'carrier-grade NAT, where Tailscale addresses live' },
  ];
  for (const port of FACTORY_CONTROL_PORTS) {
    for (const address of hostAddresses) targets.push({ host: address, port, why: `the host's own address on a control port` });
  }
  return targets;
}
