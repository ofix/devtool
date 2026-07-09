import RBush from 'rbush';

export class SpatialIndex {
    constructor() {
        this.tree = new RBush();
        this.items = new Map();
        this.idCounter = 0;
    }

    insert(item, rect) {
        const id = ++this.idCounter;
        const data = {
            minX: rect.x,
            minY: rect.y,
            maxX: rect.x + rect.width,
            maxY: rect.y + rect.height,
            id,
            item
        };
        this.tree.insert(data);
        this.items.set(id, data);
        return id;
    }

    update(id, rect) {
        const data = this.items.get(id);
        if (!data) return;
        this.tree.remove(data);
        data.minX = rect.x;
        data.minY = rect.y;
        data.maxX = rect.x + rect.width;
        data.maxY = rect.y + rect.height;
        this.tree.insert(data);
    }

    remove(id) {
        const data = this.items.get(id);
        if (!data) return;
        this.tree.remove(data);
        this.items.delete(id);
    }

    search(x, y, radius = 1) {
        const result = this.tree.search({
            minX: x - radius,
            minY: y - radius,
            maxX: x + radius,
            maxY: y + radius
        });
        return result.map(data => data.item);
    }

    searchRect(rect) {
        const result = this.tree.search({
            minX: rect.x,
            minY: rect.y,
            maxX: rect.x + rect.width,
            maxY: rect.y + rect.height
        });
        return result.map(data => data.item);
    }

    clear() {
        this.tree.clear();
        this.items.clear();
        this.idCounter = 0;
    }
}