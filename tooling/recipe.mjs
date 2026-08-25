#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { reconcileProjectRecipes } from './lib/generator.mjs';
function arg(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
const project=arg('--project');const add=arg('--add');const remove=arg('--remove');if(!project||(!add&&!remove)||(add&&remove)){console.error('Usage: npm run recipe -- --project <generated-app> (--add <recipe> | --remove <recipe>)');process.exit(2);}const root=path.resolve(project);try{const record=JSON.parse(fs.readFileSync(path.join(root,'.app-builder/recipes.json'),'utf8'));const desired=new Set((record.installed??[]).map((entry)=>entry.id));if(add)desired.add(add);if(remove)desired.delete(remove);const recipes=reconcileProjectRecipes(root,[...desired]);console.log(`Installed recipes: ${recipes.map((recipe)=>recipe.id).join(', ')||'none'}`);}catch(error){console.error(error instanceof Error?error.message:error);process.exit(1);}
