# Project Command Centre heartbeat timer

This timer publishes bounded App Builder operational telemetry once per minute. It never exposes the factory service: the collector reads `http://127.0.0.1:4310` locally and makes one outbound HTTPS request.

## Install after the telemetry endpoint exists

```sh
sudo install -d -m 0750 /etc/app-builder
sudo install -m 0600 ops/systemd/command-centre-heartbeat.env.example /etc/app-builder/command-centre-heartbeat.env
sudo install -m 0644 ops/systemd/command-centre-heartbeat.service /etc/systemd/system/command-centre-heartbeat.service
sudo install -m 0644 ops/systemd/command-centre-heartbeat.timer /etc/systemd/system/command-centre-heartbeat.timer
```

Edit `/etc/app-builder/command-centre-heartbeat.env` and replace the placeholder URL/secret. Keep the file root-owned and mode `0600`.

Before enabling the timer, prove one manual run from the repository:

```sh
sudo -u appbuilder -H bash -lc 'cd /srv/app-builder/repository && npm run command-centre:heartbeat'
```

Then enable the timer:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now command-centre-heartbeat.timer
systemctl status command-centre-heartbeat.timer --no-pager
systemctl list-timers command-centre-heartbeat.timer --no-pager
```

Inspect the latest one-shot execution without printing the environment file:

```sh
systemctl status command-centre-heartbeat.service --no-pager
journalctl -u command-centre-heartbeat.service -n 50 --no-pager
```

A failed collector or failed outbound publication produces a failed one-shot service. If the collector stops entirely, Project Command Centre independently marks the last heartbeat stale after three minutes.

## Security boundary

- No listening port is added.
- Factory access remains loopback-only.
- The writer secret can publish only to the dedicated telemetry ingress and is unrelated to App Builder provider credentials.
- The heartbeat contains no prompts, generated source, shell output, environment values or secrets.
- `activeRuns` and `agentCount` remain `null` until the factory exposes trustworthy bounded values; the collector does not infer them from process names.
