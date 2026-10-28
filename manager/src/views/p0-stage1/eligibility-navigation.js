const routes={
  STORE_INACTIVE:['store.read','/s1/stores','查看商户'],
  LICENSE_EXPIRED:['store.read','/s1/stores','查看资质'],
  QUALIFICATION_POLICY_PENDING:['catalog.write','/s1/categories','核查类目资质要求'],
  CATEGORY_NOT_ALLOWED:['catalog.write','/s1/categories','核查类目范围'],
  CHANNEL_PENDING:['channel.onboard','/s1/submerchants','核查进件关系'],
  SUB_MERCHANT_UNVERIFIED:['channel.onboard','/s1/submerchants','核查二级商户'],
  CHANNEL_LIMIT_UNVERIFIED:['channel.onboard','/s1/submerchants','核查渠道能力'],
  RECEIVER_UNVERIFIED:['channel.receiver','/s1/receivers','核查平台接收关系']
};
export function eligibilityTarget(code,can){
  const route=String(code).startsWith('AGREEMENT_')?['agreement.read','/s1/agreements','核查合作协议']:String(code).startsWith('RULE_')?['rule.read','/s1/commission-rules','核查佣金规则']:routes[code];
  return route&&can(route[0])?{path:route[1],label:route[2]}:null;
}
