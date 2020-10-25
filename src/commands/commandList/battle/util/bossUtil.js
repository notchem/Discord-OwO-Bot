/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
  */

const request = require('request');
const global = require('../../../../utils/global.js');
const WeaponInterface = require('../WeaponInterface.js');
const zooAnimalUtil = require('../../zoo/animalUtil.js');
const battleAnimalUtil = require('./animalUtil.js');
const imagegenAuth = require('../../../../../../tokens/imagegen.json');
const weaponUtil = require('./weaponUtil.js');

const bossLength = 1;// 3600000;
const guildSizes = [5, 25, 100, 500, 1000]
const rates = [
	{ c:0.6,  u:0.3,  r:0.1,  e:0,    m:0,    l:0,    f:0 },
	{ c:0.2,  u:0.5,  r:0.2,  e:0.1,  m:0,    l:0,    f:0 },
	{ c:0.1,  u:0.2,  r:0.4,  e:0.2,  m:0.1,  l:0,    f:0 },
	{ c:0.04, u:0.1,  r:0.25, e:0.35, m:0.25, l:0.01, f:0 },
	{ c:0,    u:0.04, r:0.11, e:0.4,  m:0.4,  l:0.03, f:0.02 },
	{ c:0,    u:0,  r:0.1,  e:0.35, m:0.47, l:0.05, f:0.03 }
]
const lvls = { c:[30,39], u:[40,49], r:[50,59], e:[60,69], m:[70,79], l:[80,89], f:[90,100]}
const appearRate = 1;

const animalRankPoints = parseRankPoints();
const weaponRankPoints = parseWeaponPoints();

exports.check = async function (p) {
	if (Math.random() > appearRate) return;
	const guildId = p.msg.channel.guild.id;

	// check if boss is already present
	let sql = `SELECT guild.id, guild_boss.active, guild_boss.created FROM guild LEFT JOIN guild_boss ON guild.id = guild_boss.gid WHERE guild.id = ${guildId};`
	let result = await p.query(sql);

	if (!result || !result[0]) {
		sql = `INSERT IGNORE INTO guild (id, count) VALUES (${guildId}, 0);`;
		await p.query(sql);
	} else if (!bossExpired(result[0])) {
		return;
	}
	
	const bossInfo = await createBossInfo(p.msg.channel.guild.memberCount);
	
	// save to db
	sql = `INSERT INTO guild_boss (gid, active, created, boss_animal, boss_lvl, boss_hp, boss_wp) VALUES
  				(${guildId}, 1, NOW(), '${bossInfo.animal.value}', ${bossInfo.lvl}, ${bossInfo.stats.hp[0]}, ${bossInfo.stats.wp[0]})
				ON DUPLICATE KEY UPDATE
					active = 1, created = NOW(), boss_animal = VALUES(boss_animal), boss_lvl = VALUES(boss_lvl), boss_hp = VALUES(boss_hp), boss_wp = VALUES(boss_wp);`;
	// delete existing data
	sql += `DELETE FROM boss_weapon_passive WHERE gid = ${guildId}; DELETE FROM boss_weapon WHERE gid = ${guildId}; DELETE FROM user_boss WHERE gid = ${guildId};`;
	// insert weapon and passives
	sql += `INSERT INTO boss_weapon (gid, wid, stat, avg) VALUES (${guildId}, ${bossInfo.weapon.id}, '${bossInfo.weapon.sqlStat}', ${bossInfo.weapon.avgQuality});`;
	const passiveSql = [];
	for (let i in bossInfo.weapon.passives) {
		const passive = bossInfo.weapon.passives[i];
		passiveSql.push(`(${guildId}, ${passive.id}, ${i}, '${passive.sqlStat}')`);
	}
	if (passiveSql.length) {
		sql += `INSERT INTO boss_weapon_passive (gid, wpid, pcount, stat) VALUES ${passiveSql.join(", ")};`;
	}
	result = await p.query(sql);
	
	// display
	p.send(await createEmbed(p, bossInfo));
}

async function createBossInfo (memberCount) {
	// pick boss rank
	let guildSize = guildSizes.length;
	for (let i in guildSizes) {
		if (memberCount < guildSizes[i]) {
			guildSize = i;
			break;
		}
	}
	const rate = rates[guildSize];
	const rand = Math.random();
	let rank;
	let tempTotal = 0;
	for (let i in rate) {
		tempTotal += rate[i];
		if (rand <= tempTotal.toPrecision(12)) {
			rank = i;
			break;
		}
	}

	// pick animal
	const lvl = getLvl(rank);
	const animal = global.validAnimal(zooAnimalUtil.randAnimal()[1]);
	const stats = parseStats(animal, lvl);
	
	// generate weapon
	const weapon = weaponUtil.getRandomWeapon({extraPassive: 1});

	const bossInfo = {lvl, animal, weapon, stats, time: new Date()}
	bossInfo.rank = calculateRank(bossInfo);

	return bossInfo;
}

/*
setTimeout(async () => {
	let memberCounts = [1, 24, 99, 499, 999, 1001];
	for (let i in memberCounts) {
		let memberCount = memberCounts[i];
		console.log(`\nmember count: ${memberCount}`);
		let total = {'common':0, 'uncommon':0, 'rare':0, 'epic':0, 'mythical':0, 'legendary':0, 'fabled':0};
		let count = 100000;
		for (let i = 0; i < count; i++) {
			const rank = (await createBossInfo(memberCount)).rank;
			total[rank]++;
		}
		for (let rank in total) {
			console.log(`${rank}: ${100 * (total[rank]/count)}`);
		}
	}
},100)
*/

async function createEmbed (p, { lvl, animal, weapon, stats, time, rank }) {
	const embed = {
		title: "A boss appears!",
		description: "Fight the boss with `owo boss fight`!",
		color: p.config.embed_color,
		timestamp: time,
		fields: [],
		footer: {
			text: "⚠️ The boss will run away in one hour!"
		},
		thumbnail: ""
	};

	embed.description += `\n**\`\`Lvl ${lvl}\`\`** R ${animal.value}   ${weapon.emoji}`;
	const passiveEmojis = weapon.passives.map(passive => passive.emoji);
	if (passiveEmojis) embed.description += ` ${passiveEmojis.join(' ')}`;
	const hp = stats.hp[1]+stats.hp[3];
	const att = stats.att[0]+stats.att[1];
	const pr = WeaponInterface.resToPrettyPercent(stats.pr);
	const wp = stats.wp[1]+stats.wp[3];
	const mag = stats.mag[0]+stats.mag[1];
	const mr = WeaponInterface.resToPrettyPercent(stats.mr);
	embed.description += `\n<:hp:531620120410456064> \`${hp}\` <:att:531616155450998794> \`${att}\` <:pr:531616156222488606> \`${pr}\` `;
	embed.description += `\n<:wp:531620120976687114> \`${wp}\` <:mag:531616156231139338> \`${mag}\` <:mr:531616156226945024> \`${mr}\` `;

	const uuid = await fetchBossImage({lvl, animal, weapon, stats, rank});
	if(uuid&&uuid!="") {
		embed.image = {
			url: `${imagegenAuth.imageGenUrl}/img/${uuid}.png`
		}
	}
	return {embed};
}

function fetchBossImage ({lvl, animal, weapon, stats, rank }) {
	/* Parse animal info */
	let animalID = animal.value.match(/:[0-9]+>/g);
	if(animalID) animalID = animalID[0].match(/[0-9]+/g)[0];
	else animalID = animal.value.substring(1,animal.value.length-1);
	if(animal.hidden) animalID = animal.hidden;
	const nickname = animal.name;

	/* Parse hp/wp */
	let hp = {
		current:Math.ceil(stats.hp[0]),
		max:Math.ceil(stats.hp[1]+stats.hp[3]),
		previous:Math.ceil(stats.hp[2])
	};
	if(hp.current<0) hp.current = 0;
	if(hp.previous<0) hp.previous = 0;
	let wp = {
		current:Math.ceil(stats.wp[0]),
		max:Math.ceil(stats.wp[1]+stats.wp[3]),
		previous:Math.ceil(stats.wp[2])
	};
	if(wp.current<0) wp.current = 0;
	if(wp.previous<0) wp.current = 0;

	/* Parse weapon info */
	let weaponID;
	let passiveIDs = [];
	if(weapon){
		weaponID = weapon.emoji.match(/:[0-9]+>/g);
		if(weaponID) weaponID = weaponID[0].match(/[0-9]+/g)[0];
		weapon.passives?.forEach(passive => {
			passiveID = passive.emoji.match(/:[0-9]+>/g);
			if(passiveID) passiveIDs.push(passiveID[0].match(/[0-9]+/g)[0]);
		})
	}

	/* Fetch rewards */
	const rewards = getRewards(rank, lvl);
	console.log(rewards);

	/* Construct json for POST request */
	const info = {
		rank,
		animal_name: nickname,
		animal_image: animalID,
		weapon_image: weaponID,
		weapon_passives: passiveIDs,
		animal_level: lvl,
		animal_hp: hp,
		animal_wp: wp,
		animal_att: Math.ceil(stats.att[0]+stats.att[1]),
		animal_mag: Math.ceil(stats.mag[0]+stats.mag[1]),
		animal_pr: WeaponInterface.resToPrettyPercent(stats.pr),
		animal_mr: WeaponInterface.resToPrettyPercent(stats.mr),
		rewards
	};
	info.password = imagegenAuth.password;

	/* Returns a promise to avoid callback hell */
	try{
		return new Promise( (resolve, reject) => {
			let req = request({
				method:'POST',
				uri:`${imagegenAuth.imageApiUri_t}/bossgen`,
				json:true,
				body: info,
			},(error,res,body)=>{
				if(error){
					resolve("");
					return;
				}
				if(res.statusCode==200)
					resolve(body);
				else
					resolve("");
			});
		});
	}catch (err){
		return;
	}
}

function getLvl (rank) {
	const lvlRange = lvls[rank];
	return Math.floor(lvlRange[0] + ((lvlRange[1] - lvlRange[0] + 1) * Math.random()))
}

const parseStats = exports.parseStats = function (animal, lvl) {
	const stats = battleAnimalUtil.parseStats(animal, lvl);
	return stats;
}

// Calcualte overall rank from animal rarity, weapon rarity, and level
function calculateRank (bossInfo) {
	totalPoints = 0;
	totalPoints += animalRankPoints[bossInfo.animal.rank];
	totalPoints += weaponRankPoints[bossInfo.weapon.rank.name];
	totalPoints += bossInfo.lvl * 3;
	totalPoints /= 5;
	if (totalPoints < 30)
		return 'common';
	else if (totalPoints < 35)
		return 'uncommon'
	else if (totalPoints < 45)
		return 'rare'
	else if (totalPoints < 55)
		return 'epic'
	else if (totalPoints < 65)
		return 'mythical'
	else if (totalPoints < 75)
		return 'legendary'
	else 
		return 'fabled'
}

function parseRankPoints () {
	const points = JSON.parse(JSON.stringify(require('../../../../../../tokens/owo-animals.json').points));
	const order = [];
	for (let rank in points) {
		order.push(rank);
	}
	order.sort((a, b) => points[a] - points[b]);
	const fabledPosition = order.findIndex(rank => rank === 'fabled');
	for (let i in order) {
		points[order[i]] = Math.min(100, i * (100 / fabledPosition));
	}
	return points;
}

function parseWeaponPoints () {
	const points = {};
	for (let i in WeaponInterface.ranks) {
		points[WeaponInterface.ranks[i][1]] = i * (100 / (WeaponInterface.ranks.length - 1))
	}
	return points;
}

function getRewards(rank, lvl) {
	let lvlPercent;
	for (let i in lvls) {
		if (lvls[i][0] <= lvl && lvl <= lvls[i][1]) {
			lvlPercent = (lvl - lvls[i][0]) / (lvls[i][1] - lvls[i][0]);
		}
	}
	switch (rank) {
		case 'common':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
			]
		case 'uncommon':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
			]
		case 'rare':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(100000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(100000 + Math.round(500 * lvlPercent)) },
			]
		case 'epic':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
			]
		case 'mythical':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
			]
		case 'legendary':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
			]
		case 'fabled':
			return [
				{ img: 'fcrate',   text: global.toFancyNum(1 + Math.round(1 * lvlPercent)) },
				{ img: 'shards',   text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'cowoncy',  text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
				{ img: 'xp',       text: global.toFancyNum(1000 + Math.round(500 * lvlPercent)) },
			]
		default:
			throw "No rank for: " + rank;
	}
}

function bossExpired(row) {
	return !row || !row.active || (new Date() - new Date(row.created) < bossLength)
}

exports.fetchBoss = async function (p) {
	let sql = `SELECT
			gb.active, gb.created, gb.boss_animal, gb.boss_lvl, gb.boss_hp, gb.boss_wp,
			bw.wid, bw.stat, bw.avg,
			bwp.pcount, bwp.wpid, bwp.stat as pstat
		FROM guild_boss gb
			INNER JOIN boss_weapon bw ON gb.gid = bw.gid
			INNER JOIN boss_weapon_passive bwp ON bw.gid = bwp.gid
		WHERE gb.gid = ${p.msg.channel.guild.id};`;
	let result = await p.query(sql);
	if (bossExpired(result[0])) return null;

	const animal = global.validAnimal(result[0].boss_animal);
	const stats = parseStats(animal, result[0].boss_lvl);
}

exports.fetchUsers = async function (p) {
	let sql = `SELECT u.id, ub.total_dmg
		FROM	user_boss ub
			INNER JOIN user u ON ub.uid = u.uid
		WHERE ub.gid = ${p.msg.channel.guild.id};`;
	let result = await p.query(sql);
	return [];
}