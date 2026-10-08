export const TEAM_SIZES=Object.freeze([1,2,3,4,5,6,7,8]);
export function validateRoomConfig({size=4,aiCount=0}={}){
 if(!Number.isInteger(size)||!TEAM_SIZES.includes(size))throw Error('每队人数必须为1至8，总容量最多16人。');
 const capacity=size*2;
 if(!Number.isInteger(aiCount)||aiCount<0||aiCount>=capacity)throw Error('AI数量必须为0至'+(capacity-1)+'，至少留出一个真人席位。');
 return {size,aiCount,capacity,humanCapacity:capacity-aiCount};
}
