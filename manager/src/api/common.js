import {commonApiPath, getRequest, getRequestWithNoToken, postRequestWithNoToken,uploadFileRequest,uploadFile} from '@/libs/axios';

// 通过id获取子地区
export const getChildRegion = (id) => {
  return getRequest(commonApiPath(`/region/item/${id}`));
};

// 点地图获取地址信息
export const getRegion = (params) => {
  return getRequest(commonApiPath("/region/region"), params);
};

// 获取拼图验证
export const getVerifyImg = (verificationEnums) => {
  return getRequestWithNoToken(commonApiPath(`/slider/${verificationEnums}`));
};

// 拼图验证
export const postVerifyImg = (params) => {
  return postRequestWithNoToken(commonApiPath(`/slider/${params.verificationEnums}`), params);
};


// 获取系统基础信息
export const getBaseSite = () => {
  return getRequest(commonApiPath("/site"));
};

// 上传文件
export const upLoadFile = (bold) =>{
  return uploadFileRequest(uploadFile,bold);
}
