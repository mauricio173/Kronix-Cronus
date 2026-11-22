const test = require('node:test');
const assert = require('node:assert/strict');
const { safeEqual } = require('../server/security');
test('safeEqual compara strings de mesmo conteúdo',()=>assert.equal(safeEqual('abc','abc'),true));
test('safeEqual rejeita conteúdo diferente',()=>assert.equal(safeEqual('abc','abd'),false));
test('safeEqual rejeita comprimentos diferentes',()=>assert.equal(safeEqual('abc','abcd'),false));
