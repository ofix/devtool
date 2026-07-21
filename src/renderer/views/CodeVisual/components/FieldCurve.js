class FieldCurve {
    constructor({ startPort = null, endPort = null, }) {
        this.id = new Date();
        this.startPort = startPort;
        this.endPort = endPort;
        this.isDirty = false;
        this.ctrlPt1 = []; // 贝塞尔控制曲线1
        this.ctrlPt2 = []; // 贝塞尔控制曲线2
        this.bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    // 快速判断鼠标点是否在曲线的包围盒中
    containsPoint(worldX, worldY) {
        return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
    }

    bezier3(P0, P1, P2, P3, t) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        return {
            x: mt3 * P0.x + 3 * mt2 * t * P1.x + 3 * mt * t2 * P2.x + t3 * P3.x,
            y: mt3 * P0.y + 3 * mt2 * t * P1.y + 3 * mt * t2 * P2.y + t3 * P3.y,
        };
    }

    // 两点距离平方（不开根号，提速）
    distSq(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }


    /**
     * 采样法拾取曲线
     * @param mouseW 鼠标世界坐标
     * @param P0 起点端口世界坐标
     * @param P1 控制点1
     * @param P2 控制点2
     * @param P3 终点端口世界坐标
     * @param hitWorldDist 拾取阈值（世界距离）
     * @param sampleCount 采样数，默认12
     * @returns 是否命中曲线
     */
    hitTestBezierCurve(
        mouseW,
        P0, P1, P2, P3,
        hitWorldDist,
        sampleCount = 12
    ) {
        const hitSq = hitWorldDist * hitWorldDist;
        for (let i = 0; i <= sampleCount; i++) {
            const t = i / sampleCount;
            const pt = bezier3(P0, P1, P2, P3, t);
            if (distSq(mouseW, pt) < hitSq) {
                return true;
            }
        }
        return false;
    }
}