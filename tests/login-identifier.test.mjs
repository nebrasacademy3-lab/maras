import test from 'node:test';
import assert from 'node:assert/strict';
import { pureSource } from './helpers/pure-source.mjs';
const { loginPhoneCandidate }=await pureSource('lib/login-identifier.ts');
test('international instructor login retains the country code across web and native identifiers',()=>{
 for(const [input,expected] of [['+20 100 123 4567','+201001234567'],['00971501234567','+971501234567'],['+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧','+966501234567'],['0501234567','+966501234567'],['501234567','+966501234567'],['966501234567','+966501234567']])assert.equal(loginPhoneCandidate(input),expected);
});
test('email, malformed and ambiguous international identifiers are not silently rewritten as Saudi phones',()=>{
 for(const input of ['person123@example.test','++201001234567','abc+201001234567','201001234567','+0001234567'])assert.equal(loginPhoneCandidate(input),input);
});
