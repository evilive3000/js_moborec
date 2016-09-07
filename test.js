
const _ = require('lodash');
const items = {};

function run(){
  const A = _.random(1, 10);
  const B = _.random(1, 10);
  const sim = Math.random();

  if (A == 1 || B == 1) {
    console.log(items['1']);
  }
  
  for (let [a, b] of [[A, B], [B, A]]) {
    const data = items[a] || (items[a] = {r: [], c: 0});
    let index = _.findIndex(data.r, {0: b});
    index > -1 && _.pullAt(data.r, index);
    index = _.sortedIndexBy(data.r, [b, sim], 1);
    data.r.splice(index, 0, [b, sim]);
  }
}


for(let i = 100; i > 0; i--){
  run();
}

console.log(items[1]);