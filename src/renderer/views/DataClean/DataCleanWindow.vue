<template>
    <div class="app">
      <TopToolbar />
      <PreviewPanel />
      <NodeEditor />
    </div>
  </template>
  
  <script setup>
  import TopToolbar from './components/TopToolbar.vue'
  import PreviewPanel from './components/PreviewPanel.vue'
  import NodeEditor from './components/NodeEditor.vue'
  </script>
  
  <style>
  html, body, #app { height: 100%; margin: 0; }
  .app { display: flex; flex-direction: column; height: 100vh; }
  </style>