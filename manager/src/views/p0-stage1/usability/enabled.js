export const usabilityEnabled = typeof BASE !== 'undefined' && BASE.stage1Enabled === true && (BASE.stage2Enabled !== true || BASE.p0IntegrationEnabled === true) && BASE.stage1WebUsabilityEnabled === true;
export const usabilityEntry = {computed:{usabilityEnabled(){return usabilityEnabled;}}};
