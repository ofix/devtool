import tushare as ts
import pandas as pd

# 初始化
ts.set_token('ee1af62cef664a2d14e5bcf8424c94eb09a7e59c6e7779a9677df353')
pro = ts.pro_api()

# 空列表，用于存放所有分页的数据
all_data = []

# 循环取数，设置每次获取5000条
page = 0
limit = 5000  # 每次请求5000条，这是当前积分下的安全值
has_more = True

while has_more:
    # offset = 页码 * 每页数量
    offset = page * limit
    print(f"正在获取第 {page+1} 页，offset={offset}, limit={limit}...")
    
    try:
        # 核心：通过 offset 和 limit 进行分页
        df = pro.namechange(limit=limit, offset=offset)
        
        # 如果返回的数据为空，说明已经取完了，退出循环
        if df.empty:
            print("数据获取完毕。")
            has_more = False
            break
        
        # 将获取到的数据添加到列表中
        all_data.append(df)
        page += 1
        
    except Exception as e:
        print(f"获取第 {page+1} 页时发生错误: {e}")
        break

# 所有分页数据拼接成一个完整的DataFrame
if all_data:
    final_df = pd.concat(all_data, ignore_index=True)
    print(f"总共获取到 {len(final_df)} 条更名记录")
    
    # 导出为CSV
    final_df.to_csv('old_names.csv', encoding='utf-8-sig', index=False)
else:
    print("未获取到任何数据。")
