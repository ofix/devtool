import ConnAdapter from "./ConnAdapter.js";
import { Client } from "ssh2";

export class SSHAdapter extends ConnAdapter {
  constructor(options = {}) {
    super();
    this.config = {
      host: "",
      port: 22,
      username: "",
      password: "",
      readyTimeout: 10000,
      strictHostKeyChecking: "no",
      debug: (message) => console.log(`[SSH2 Debug]: ${message}`),
      algorithms: {
        cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr"],
        serverHostKey: [
          "ssh-rsa",
          "ssh-dss",
          "ssh-rsa",
          "ecdsa-sha2-nistp256",
        ],
      },
      hostVerifier: (key) => {
        try {
          const fingerprint = key.getFingerprint("sha256").toString("hex");
          Print.debug(`服务器指纹: ${fingerprint}`);
          return true;
        } catch (err) {
          Print.warn("指纹检查跳过");
          return true;
        }
      },
      ...options,
    };
  }

  async create() {
    return new Promise((resolve, reject) => {
      const sshClient = new Client();
      sshClient
        .on("ready", () => {
          console.log("[SSH适配器] 连接创建成功");
          resolve(sshClient);
        })
        .on("error", (err) => {
          reject(new Error(`[SSH适配器] 连接失败：${err.message}`));
        })
        .connect(this.config);
    });
  }

  async destroy(connection) {
    return new Promise((resolve) => {
      if (connection._closed) {
        resolve();
        return;
      }
      connection.end(() => {
        console.log("[SSH适配器] 连接销毁成功");
        resolve();
      });
    });
  }

  async isValid(connection) {
    return Promise.resolve(!connection._closed);
  }
}