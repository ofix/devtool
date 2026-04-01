import DataProviderManager from '../service/mini-stock/providers/DataProviderManager.js';

let matches = await DataProviderManager.searchLocalStock("大");
for(let i=0; i<matches.length; i++){
    let stock = matches[i];
    console.log(`${stock.name},${stock.code},${stock.market}`);
}
console.log("找到股票数: ",matches.length);
