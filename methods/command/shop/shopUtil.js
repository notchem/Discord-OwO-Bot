const fid = {};
const food = require('../../../json/food.json');
const global = require('../../../util/global.js');
const numbers = ["⁰","¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹"];

for(var key in food){
	fid[food[key].id] = key;
}

exports.getItem = function(args){
	var id = 0;
	if(args.length!=1){
		return "Invalid arguments!";
	}
	
	if(global.isInt(args[0])){
		id = parseInt(args[0]);
	}else{
		return "Invalid arguments!";
	}

	var key = fid[id];
	if(!key){return "That id is wrong!";}
	item = food[key];
	if(!item){return "I could not find that item!";}
	item.key = key;
	return item;
}
exports.toSmallNum = function(count,digits){
		var result = "";
		var num = count;
		for(i=0;i<digits;i++){
					var digit = count%10;
					count = Math.trunc(count/10);
					result = numbers[digit]+result;
				}
		return result;
}