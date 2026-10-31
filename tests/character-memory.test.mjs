import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_MEMORY,characterContext} from '../backend/character-memory.mjs';

test('verified character memory selects bounded relevant evidence without storing the query',()=>{
 const context=characterContext('我好困，想休息。PRIVATE_VISITOR_NOTE');
 const data=JSON.parse(context.slice(context.indexOf('{')));
 assert.equal(CHARACTER_MEMORY.source.rows,2539);assert.equal(CHARACTER_MEMORY.source.reviewed,15);
 assert.equal(data.identity.name,'新海天');assert.ok(data.relationships.some(r=>r.name==='新海翔'));
 assert.equal(data.examples.length,3);assert.equal(data.examples[0].id,'sr0305');
 assert.ok(data.examples.every(row=>Number.isInteger(row.line)&&!('text' in row)));
 assert.ok(!context.includes('PRIVATE_VISITOR_NOTE'));assert.ok(!context.includes('D:\\pyprojs'));assert.ok(context.includes('不把原作经历当成与当前访客共同经历'));
});
