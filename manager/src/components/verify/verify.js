
import {commonApiPath, getRequestWithNoToken, postRequestWithNoToken} from '@/libs/axios';


// 获取拼图验证
export const getVerifyImg = (verificationEnums) => {
  return getRequestWithNoToken(commonApiPath(`/slider/${verificationEnums}`));
};

// 拼图验证
export const postVerifyImg = (params) => {
  return postRequestWithNoToken(commonApiPath(`/slider/${params.verificationEnums}`), params);
};
