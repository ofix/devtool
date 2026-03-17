<template>
  <div class="app">
    <h1>MP4 树形可视化</h1>
    <TopDownTreeVisualizer
      :tree-data="mp4TreeData"
      :canvas-config="{ width: '100%', height: '90vh' }"
      :visualizer-config="{ baseHeight: 45 }"
    />
  </div>
</template>

<script setup>
import TopDownTreeVisualizer from "@/components/Visualizers/TopDownTreeVisualizer.vue";

// 模拟 MP4 树形数据（可替换为真实数据）
const mp4TreeData = {
  name: "moov",
  type: "box",
  bytes: 4096,
  value: "0x00000000 6D6F6F76",
  desc: "Movie Box（MP4元数据根容器）- 第1级",
  expanded: true,
  children: [
    {
      name: "mvhd",
      type: "box",
      bytes: 108,
      value: "0x0000006C 6D766864",
      desc: "Movie Header Box（影片头）- 第2级",
      expanded: true,
      children: [
        {
          name: "version",
          type: "field",
          bytes: 1,
          value: "0x00",
          desc: "版本号 - 字段",
        },
        {
          name: "flags",
          type: "field",
          bytes: 3,
          value: "0x000000",
          desc: "标志位 - 字段",
        },
        {
          name: "timescale",
          type: "field",
          bytes: 4,
          value: "0x000003E8",
          desc: "时间刻度 - 字段",
        },
        {
          name: "duration",
          type: "field",
          bytes: 8,
          value: "0x000F4240",
          desc: "总时长 - 字段",
        },
      ],
    },
    {
      name: "trak",
      type: "box",
      bytes: 2048,
      value: "0x00000800 7472616B",
      desc: "Track Box（轨道容器）- 第2级",
      expanded: false,
      children: [
        {
          name: "tkhd",
          type: "field",
          bytes: 92,
          value: "0x0000005C",
          desc: "Track Header - 字段",
        },
        {
          name: "mdia",
          type: "box",
          bytes: 1536,
          value: "0x00000600 6D646961",
          desc: "Media Box（媒体容器）- 第3级",
          expanded: false,
          children: [
            {
              name: "mdhd",
              type: "field",
              bytes: 32,
              value: "0x00000020",
              desc: "Media Header - 字段",
            },
            {
              name: "minf",
              type: "box",
              bytes: 1024,
              value: "0x00000400 6D696E66",
              desc: "Media Information Box（媒体信息）- 第4级",
              expanded: false,
              children: [
                {
                  name: "vmhd",
                  type: "field",
                  bytes: 16,
                  value: "0x00000010",
                  desc: "视频媒体头 - 字段",
                },
                {
                  name: "dinf",
                  type: "field",
                  bytes: 24,
                  value: "0x00000018",
                  desc: "数据信息 - 字段",
                },
                {
                  name: "stbl",
                  type: "box",
                  bytes: 800,
                  value: "0x00000320",
                  desc: "样本表 - 子Box",
                  expanded: false,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "udta",
      type: "box",
      bytes: 128,
      value: "0x00000080 75647461",
      desc: "User Data Box（用户数据）- 第2级",
      expanded: false,
    },
  ],
};
</script>

<style scoped>
.app {
  padding: 20px;
}

h1 {
  text-align: center;
  margin-bottom: 20px;
}
</style>
