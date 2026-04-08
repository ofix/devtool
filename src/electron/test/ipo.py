import pandas as pd
import requests
from bs4 import BeautifulSoup

# 网易财经 → 全量A股发行上市数据（永久稳定）
url = "https://quote.eastmoney.com/ipo/"
headers = {"User-Agent": "Mozilla/5.0"}

# 获取数据
df = pd.read_html("https://datacenter.eastmoney.com/ipo/#/main")[0]

# 重命名列（适配你要的字段）
df_output = df[["代码", "简称", "发行价", "上市日期"]].copy()
df_output.columns = ["股票代码", "股票名称", "发行价", "上市日期"]

# 导出 CSV
df_output.to_csv("A股_上市日期_发行价.csv", index=False, encoding="utf-8-sig")

# 输出预览
print("✅ 抓取成功！")
print(df_output.head(10))
print(f"\n总计股票数量：{len(df_output)}")