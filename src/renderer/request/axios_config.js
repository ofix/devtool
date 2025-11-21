// 请求配置

import axios from "axios";

// 定义公共前缀，创建请求实例
// const baseUrl = "http://localhost:8080";
const baseURL = '/api/';
const instance = axios.create({baseURL})