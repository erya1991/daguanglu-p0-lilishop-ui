
import {commonApiPath, getRequestWithNoToken, postRequestWithNoToken} from '@/libs/axios';


// Stage1 uses the Manager origin. Keep Stage2 and legacy runtimes unchanged.
const verificationPath = verificationEnums =>
  typeof BASE !== 'undefined' && BASE.stage1Enabled === true && (BASE.stage2Enabled !== true || BASE.stage2WebUiEnabled === true)
    ? `/common/slider/${verificationEnums}`
    : commonApiPath(`/slider/${verificationEnums}`);

// 获取拼图验证
export const getVerifyImg = async (verificationEnums) => {
  try { return await getRequestWithNoToken(verificationPath(verificationEnums)); }
  catch (error) {
    if (typeof BASE !== 'undefined' && BASE.stage2Enabled === true && BASE.stage2WebUiEnabled === true) return {success:false,code:'CAPTCHA_UNAVAILABLE',message:'验证码暂不可用，请稍后重试。'};
    throw error;
  }
};

// 拼图验证
export const postVerifyImg = (params) => {
  return postRequestWithNoToken(verificationPath(params.verificationEnums), params);
};
