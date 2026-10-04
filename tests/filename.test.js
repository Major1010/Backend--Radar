const assert = require('assert');
const { generateFilename, parseMusicAndSinger, sanitizePart } = require('../src/downloader/filename');

console.log('--- Testing Filename Formatter & Sanitizer ---');

// Test 1: Direct music + artist metadata
const test1 = generateFilename({ track: 'Tum Hi Ho', artist: 'Arijit Singh' }, 'mp3');
console.log('Test 1:', test1);
assert.strictEqual(test1, 'Tum_Hi_Ho__Arijit_Singh.mp3');

// Test 2: Standard Title "Artist - Song"
const test2 = generateFilename({ title: 'Ed Sheeran - Shape of You (Official Music Video)', author: 'Ed Sheeran' }, 'mp3');
console.log('Test 2:', test2);
assert.strictEqual(test2, 'Shape_of_You__Ed_Sheeran.mp3');

// Test 3: MP4 extension
const test3 = generateFilename({ title: 'Arijit Singh - Kesariya', author: 'Sony Music India' }, 'mp4');
console.log('Test 3:', test3);
assert.strictEqual(test3, 'Kesariya__Arijit_Singh.mp4');

// Test 4: Special Characters & Illegal Windows characters
const test4 = generateFilename({
  title: 'AC/DC - Back in Black [Official 4K Video] : Remastered?',
  author: 'AC/DC Official'
}, 'mp3');
console.log('Test 4:', test4);
assert.strictEqual(test4, 'Back_in_Black__AC_DC.mp3');

// Test 5: Fallback to channel when title is plain
const test5 = generateFilename({
  title: 'Apna Bana Le',
  author: 'Arijit Singh'
}, 'mp3');
console.log('Test 5:', test5);
assert.strictEqual(test5, 'Apna_Bana_Le__Arijit_Singh.mp3');

// Test 6: "The Weeknd - Blinding Lights"
const test6 = generateFilename({
  title: 'The Weeknd - Blinding Lights (Official Audio)',
  author: 'The Weeknd'
}, 'mp3');
console.log('Test 6:', test6);
assert.strictEqual(test6, 'Blinding_Lights__The_Weeknd.mp3');

// Test 7: Instagram Reel with platform tag
const test7 = generateFilename({ title: 'Sunset vibes in Bali', author: 'travel_diaries' }, 'mp4', '[Instagram]');
console.log('Test 7:', test7);
assert.strictEqual(test7, '[Instagram]_Sunset_vibes_in_Bali__travel_diaries.mp4');

// Test 8: Twitter/X video with platform tag
const test8 = generateFilename({ title: 'Starship flight test 3 liftoff', author: 'SpaceX' }, 'mp4', '[X]');
console.log('Test 8:', test8);
assert.strictEqual(test8, '[X]_Starship_flight_test_3_liftoff__SpaceX.mp4');

// Test 9: Facebook Watch with platform tag
const test9 = generateFilename({ title: 'Cooking delicious pasta at home', author: 'Chef_Master' }, 'mp4', '[Facebook]');
console.log('Test 9:', test9);
assert.strictEqual(test9, '[Facebook]_Cooking_delicious_pasta_at_home__Chef_Master.mp4');

// Test 10: Snapchat Spotlight with platform tag
const test10 = generateFilename({ title: 'Trickshot on first try', author: 'spotlight_creator' }, 'mp4', '[Snapchat]');
console.log('Test 10:', test10);
assert.strictEqual(test10, '[Snapchat]_Trickshot_on_first_try__spotlight_creator.mp4');

console.log('✅ All filename and multi-platform tests passed successfully!');
