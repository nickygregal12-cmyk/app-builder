#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readJson, validateManifest } from './lib/manifest.mjs';
import { generateProject } from './lib/generator.mjs';
const manifest=readJson('examples/generator-project-manifest.json');const errors=validateManifest(manifest);if(errors.length)throw new Error(errors.join('\n'));const out=path.resolve('.tmp/generated-acceptance');fs.rmSync(out,{recursive:true,force:true});generateProject(manifest,out);console.log(out);
