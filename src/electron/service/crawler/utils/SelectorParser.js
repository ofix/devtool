export default class SelectorParser {
    parse(selector) {
        if (typeof selector !== 'string') {
            return { selector, type: 'text' };
        }
        
        if (selector.includes('@')) {
            const [css, attr] = selector.split('@');
            return {
                selector: css.trim(),
                attribute: attr.trim(),
                type: 'attribute'
            };
        }
        
        if (selector.includes('*')) {
            return {
                selector: selector.replace('*', ''),
                multiple: true,
                type: 'text'
            };
        }
        
        return {
            selector: selector.trim(),
            type: 'text'
        };
    }
    
    format(config) {
        if (config.attribute) {
            return `${config.selector}@${config.attribute}`;
        }
        if (config.multiple) {
            return `${config.selector}*`;
        }
        return config.selector;
    }
}
