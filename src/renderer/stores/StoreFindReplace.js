import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useFindReplaceStore = defineStore('searchReplace', () => {
    // ========== 状态定义 ==========
    // 当前编辑文件
    const currentFile = ref({
        name: "App.vue",
        path: "/src/App.vue",
        content: `
<template>
  <div class="app-container">
    <h1>Vue Search Replace Demo</h1>
    <p>This is a test file for search and replace functionality.</p>
    <p>Test test Test TEST</p>
    <div class="test-class">Test content here</div>
  </template>

<script setup>
import { ref } from "vue";
const testValue = ref("test");
const Test = ref(123);
// Test comment with test
</script>
    `.trim()
    })

    // 搜索替换值
    const searchValue = ref("")
    const replaceValue = ref("")

    // 匹配配置
    const matchConfig = ref({
        caseSensitive: false,
        regex: false,
        wholeWord: false
    })

    // 匹配状态
    const matches = ref([]) // { start, end, line }
    const matchCount = ref(0)
    const currentMatchIndex = ref(-1)
    const activeLine = ref(-1)

    // ========== 计算属性 ==========
    // 生成高亮后的内容（核心计算属性）
    const highlightedContent = computed(function () {
        if (!searchValue.value || matches.value.length === 0) {
            return currentFile.value.content.split('\n').map(line => line.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        }

        const lines = currentFile.value.content.split('\n')
        return lines.map(function (line, lineNum) {
            let processedLine = line.replace(/</g, '&lt;').replace(/>/g, '&gt;')
            const lineMatches = matches.value.filter(function (m) {
                return m.line === lineNum
            })

            if (lineMatches.length === 0) return processedLine

            // 倒序替换避免索引错乱
            lineMatches.sort(function (a, b) {
                return b.start - a.start
            }).forEach(function (match) {
                const isCurrent = matches.value.findIndex(function (m) {
                    return m.line === lineNum && m.start === match.start && m.end === match.end
                }) === currentMatchIndex.value

                const highlightClass = isCurrent ? 'highlight-current' : 'highlight'
                processedLine =
                    processedLine.substring(0, match.start) +
                    `<span class="${highlightClass}">${processedLine.substring(match.start, match.end)}</span>` +
                    processedLine.substring(match.end)
            })

            return processedLine
        })
    })

    // ========== 方法定义（全部用 function() {} 形式） ==========
    // 切换匹配配置
    const toggleMatchConfig = function (key) {
        matchConfig.value[key] = !matchConfig.value[key]
        findAllMatches()
    }

    // 查找所有匹配项
    const findAllMatches = function () {
        if (!searchValue.value) {
            matches.value = []
            matchCount.value = 0
            currentMatchIndex.value = -1
            activeLine.value = -1
            return
        }

        const content = currentFile.value.content
        const lines = content.split('\n')
        const searchStr = matchConfig.value.caseSensitive ? searchValue.value : searchValue.value.toLowerCase()
        const allMatches = []

        lines.forEach(function (line, lineNum) {
            const lineToCheck = matchConfig.value.caseSensitive ? line : line.toLowerCase()
            let regex

            try {
                if (matchConfig.value.regex) {
                    regex = new RegExp(searchStr, matchConfig.value.caseSensitive ? 'g' : 'gi')
                } else if (matchConfig.value.wholeWord) {
                    const escaped = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    regex = new RegExp(`\\b${escaped}\\b`, matchConfig.value.caseSensitive ? 'g' : 'gi')
                } else {
                    const escaped = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    regex = new RegExp(escaped, matchConfig.value.caseSensitive ? 'g' : 'gi')
                }

                let match
                while ((match = regex.exec(lineToCheck)) !== null) {
                    allMatches.push({
                        line: lineNum,
                        start: match.index,
                        end: match.index + match[0].length
                    })
                }
            } catch (e) {
                // 正则错误降级为普通匹配
                let pos = lineToCheck.indexOf(searchStr)
                while (pos !== -1) {
                    allMatches.push({
                        line: lineNum,
                        start: pos,
                        end: pos + searchStr.length
                    })
                    pos = lineToCheck.indexOf(searchStr, pos + searchStr.length)
                }
            }
        })

        matches.value = allMatches
        matchCount.value = allMatches.length

        // 重置匹配索引
        if (currentMatchIndex.value >= allMatches.length) {
            currentMatchIndex.value = allMatches.length > 0 ? 0 : -1
        }

        if (currentMatchIndex.value !== -1) {
            activeLine.value = matches.value[currentMatchIndex.value].line
            scrollToActiveLine()
        }
    }

    // 滚动到激活行
    const scrollToActiveLine = function () {
        setTimeout(function () {
            const contentEl = document.querySelector('.file-content')
            if (contentEl && activeLine.value !== -1) {
                const activeLineEl = contentEl.querySelector(`.code-line:nth-child(${activeLine.value + 1})`)
                if (activeLineEl) {
                    activeLineEl.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    })
                }
            }
        }, 0)
    }

    // 查找下一个
    const findNext = function () {
        if (matches.value.length === 0) return
        currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length
        activeLine.value = matches.value[currentMatchIndex.value].line
        scrollToActiveLine()
    }

    // 查找上一个
    const findPrev = function () {
        if (matches.value.length === 0) return
        currentMatchIndex.value = (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length
        activeLine.value = matches.value[currentMatchIndex.value].line
        scrollToActiveLine()
    }

    // 替换当前匹配项
    const replaceCurrent = function () {
        if (currentMatchIndex.value === -1 || !searchValue.value) return

        const match = matches.value[currentMatchIndex.value]
        const lines = currentFile.value.content.split('\n')
        lines[match.line] =
            lines[match.line].substring(0, match.start) +
            replaceValue.value +
            lines[match.line].substring(match.end)

        currentFile.value.content = lines.join('\n')
        findAllMatches()

        if (matches.value.length > 0) {
            currentMatchIndex.value = Math.min(currentMatchIndex.value, matches.value.length - 1)
        } else {
            currentMatchIndex.value = -1
            activeLine.value = -1
        }
    }

    // 替换所有匹配项
    const replaceAll = function () {
        // 1. 前置校验：空搜索值/无匹配项直接返回
        if (!searchValue.value || matches.value.length === 0) {
            console.warn("无匹配项或搜索值为空，无需替换");
            return;
        }

        // 2. 深拷贝原文件内容，避免替换过程中影响原数据
        const originalContent = JSON.parse(JSON.stringify(currentFile.value.content));
        const lines = originalContent.split('\n');

        // 3. 对匹配项按行分组，每行内倒序替换（避免同内行索引偏移）
        // 先按行分组
        const matchesByLine = {};
        matches.value.forEach(function (match) {
            if (!matchesByLine[match.line]) {
                matchesByLine[match.line] = [];
            }
            matchesByLine[match.line].push(match);
        });

        // 4. 逐行处理：每行内的匹配项按 end 倒序排序后替换
        Object.keys(matchesByLine).forEach(function (lineNumStr) {
            const lineNum = parseInt(lineNumStr);
            let lineContent = lines[lineNum];

            // 按 end 倒序排序，避免前面替换影响后面索引
            matchesByLine[lineNum].sort(function (a, b) {
                return b.end - a.end;
            }).forEach(function (match) {
                // 校验索引合法性（防止越界）
                if (match.start < 0 || match.end > lineContent.length) {
                    console.warn("匹配项索引越界，跳过:", match);
                    return;
                }
                // 执行替换
                lineContent =
                    lineContent.substring(0, match.start) +
                    replaceValue.value +
                    lineContent.substring(match.end);
            });

            // 更新该行内容
            lines[lineNum] = lineContent;
        });

        // 5. 更新文件内容（先更新，再重新查找匹配项）
        currentFile.value.content = lines.join('\n');

        // 6. 先记录替换数量，再重新查找匹配项
        const replacedCount = matches.value.length;

        // 7. 重新查找匹配项（获取最新的匹配状态）
        findAllMatches();

        // 8. 重置匹配索引（基于最新的 matches）
        if (matches.value.length > 0) {
            currentMatchIndex.value = 0;
            activeLine.value = matches.value[0].line;
        } else {
            currentMatchIndex.value = -1;
            activeLine.value = -1;
        }

        console.log(`已成功替换 ${replacedCount} 个匹配项`);
    }

    // 重置搜索
    const resetSearch = function () {
        searchValue.value = ""
        replaceValue.value = ""
        matches.value = []
        matchCount.value = 0
        currentMatchIndex.value = -1
        activeLine.value = -1
    }

    // 搜索处理
    const handleSearch = function () {
        findAllMatches()
    }

    // ========== 暴露状态和方法 ==========
    return {
        // 状态
        currentFile,
        searchValue,
        replaceValue,
        matchConfig,
        matches,
        matchCount,
        currentMatchIndex,
        activeLine,
        // 计算属性
        highlightedContent,
        // 方法
        toggleMatchConfig,
        findAllMatches,
        scrollToActiveLine,
        findNext,
        findPrev,
        replaceCurrent,
        replaceAll,
        resetSearch,
        handleSearch
    }
})