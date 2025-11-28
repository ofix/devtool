class HexDump {
    constructor(buffer, cols = 16) {
        this.buffer = buffer;
        this.cols = cols; // 16个字节一行
    }

    // 输出不重复行数据
    hexDiffLine (buffer, line_no) {
        let line = this.formatLineNo(line_no) + "  ";
        let data = [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0"));
        for (let i = 0; i < data.length; i += 8) {
            let start = i;
            let end = start + 8 > data.length ? data.length : start + 8;
            line += data.slice(start, end).join(" ") + "  ";
        }
        line += '  |';
        line += [...new Uint8Array(buffer)].map(x => { if (x < 32 || x >= 128) return "."; return String.fromCharCode(x); }).join("");
        line += '|';
        return line;
    }

    // 格式化行号
    formatLineNo (line_no) {
        return line_no.toString(16).padStart(8, "0");
    }

    // 是否是重复行
    isSameHexLine (line, prev_line) {
        if (line.byteLength != prev_line.byteLength) {
            return false;
        }
        let is_same = true;
        let a = new Uint8Array(line);
        let b = new Uint8Array(prev_line);
        for (let offset = 0; offset < line.byteLength; offset++) {
            if (a[offset] != b[offset]) {
                is_same = false;
                break;
            }
        }
        return is_same;
    }

    // 获取16进制数据行
    web () {
        let buf = this.buffer;
        let prevLine = new Uint8Array();
        let lines = [];
        let same_line_start = -1;
        let same_line_end = -1;
        let line_no = 0;
        for (let i = 0; i < buf.sector_count; i++) {
            for (let j = 0; j < ISO9660_SECTOR_SIZE;) {
                let data = buf.sector_list[i].slice(j, j + 16);
                line_no = i * ISO9660_SECTOR_SIZE + j;
                if (!this.isSameHexLine(data, prevLine)) {
                    if (same_line_start != -1 && same_line_end != -1) {
                        lines.push("*");
                        same_line_start = -1;
                        same_line_end = -1;
                    }
                    lines.push(this.hexDiffLine(data, line_no));
                } else {
                    if (same_line_start == -1) {
                        same_line_start = line_no;
                    }
                    same_line_end = line_no;
                }
                j += 16;
                prevLine = data;
            }
        }
        lines.push("*");
        lines.push(this.formatLineNo(line_no + 16));
        return lines;
    }

    // 输出不同行数据前半部分(部分数据块16进制展示)
    offsetLineFront (buffer, offset, line_no) {
        let line = this.formatLineNo(line_no) + "  ";
        let data = [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0"));
        for (let i = 0; i < offset; i++) {
            data.unshift('  ');
        }
        line += data.slice(0, 8).join(' ') + "  ";
        line += data.slice(8, 16).join(' ');
        line += '  |';
        for (let i = 0; i < offset; i++) {
            line += ' ';
        }
        line += [...new Uint8Array(buffer)].map(x => { if (x < 32 || x >= 128) return "."; return String.fromCharCode(x); }).join("");
        line += '|';
        return line;
    }

    // 输出不同行数据后半部分(部分数据块16进制展示)
    offsetLineTail (buffer, line_no) {
        let line = this.formatLineNo(line_no) + "  ";
        let data = [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0"));
        for (let i = 0; i < 16 - buffer.length; i++) {
            data.push('  ');
        }
        line += data.slice(0, 8).join(' ') + "  ";
        line += data.slice(8, 16).join(' ');
        line += '  |';
        line += [...new Uint8Array(buffer)].map(x => { if (x < 32 || x >= 128) return "."; return String.fromCharCode(x); }).join("");
        for (let i = 0; i < 16 - buffer.length; i++) {
            line += ' ';
        }
        line += '|';
        return line;
    }

    // 打印任意一块带有偏移位置的二进制数据块
    consoleFileMap (offset) {
        let label = "+++++++++++++++ HEX DATA DEBUGGER +++++++++++++++";
        console.group(label);
        let buf = this.buffer;
        let length = buf.byteLength;
        let prevLine = new Uint8Array();
        let same_line_start = -1;
        let same_line_end = -1;
        let _offset = offset % 16;
        let offset_next = 16 - _offset;
        let line_no = Math.ceil(offset / 16);
        if (_offset != 0) {
            let data = buf.slice(0, offset_next);
            console.log(this.offsetLineFront(data, _offset, line_no - 1));
        }
        let nLines = Math.floor((length - offset_next) / 16);
        for (let j = 0; j < nLines;) {
            let begin = offset_next + 16 * j;
            let data = buf.slice(begin, begin + 16);
            line_no += j;
            if (!this.isSameHexLine(data, prevLine)) {
                if (same_line_start != -1 && same_line_end != -1) {
                    console.log("*");
                    same_line_start = -1;
                    same_line_end = -1;
                }
                console.log(this.hexDiffLine(data, line_no));
            } else {
                if (same_line_start == -1) {
                    same_line_start = line_no;
                }
                same_line_end = line_no;
            }
            j += 1;
            prevLine = data;
        }
        let reserved = length - offset_next - nLines * 16;
        if (reserved != 0) {
            let data = buf.slice(offset_next + nLines * 16, length);
            console.log(this.offsetLineTail(data, offset_next + nLines * 16, line_no + 1));
        }
        console.groupEnd(label);
    }

    // 控制台输出16进制数据
    console () {
        let label = "++++++++++++++++++++++++++++++++++ HEX DATA DEBUGGER ++++++++++++++++++++++++++++++";
        console.group(label);
        let buf = this.buffer;
        let len = buf.length;
        let prevLine = new Uint8Array();
        let same_line_start = -1;
        let same_line_end = -1;
        let line_no = 0;
        for (let i = 0; i < len;) {
            let data = buf.slice(i, i + this.cols);
            line_no = i;
            if (!this.isSameHexLine(data, prevLine)) {
                if (same_line_start != -1 && same_line_end != -1) {
                    console.log("*");
                    same_line_start = -1;
                    same_line_end = -1;
                }
                console.log(this.hexDiffLine(data, line_no));
            } else {
                if (same_line_start == -1) {
                    same_line_start = line_no;
                }
                same_line_end = line_no;
            }
            i += this.cols;
            prevLine = data;
        }
        console.groupEnd(label);
    }
}

export default HexDump;