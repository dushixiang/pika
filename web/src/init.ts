
// Default configuration
const defaultConfig = {
    SystemNameZh: "Pika",
    SystemNameEn: "Monitor",
    ICPCode: "",
    DefaultView: "grid",
};

// Initialize SystemConfig from injected JSON
try {
    const el = document.getElementById('app-config');
    if (el && el.textContent) {
        const config = JSON.parse(el.textContent);

        // Merge with default config and expose to window
        window.SystemConfig = {
            SystemNameZh: config.systemNameZh || defaultConfig.SystemNameZh,
            SystemNameEn: config.systemNameEn || defaultConfig.SystemNameEn,
            ICPCode: config.icpCode || defaultConfig.ICPCode,
            DefaultView: config.defaultView || defaultConfig.DefaultView,
        };

        // Inject Custom CSS
        if (config.customCSS) {
            const style = document.createElement('style');
            style.innerHTML = config.customCSS;
            document.head.appendChild(style);
        }

        // Inject Custom JS
        if (config.customJS) {
            const injectJS = () => {
                const script = document.createElement('script');
                script.innerHTML = config.customJS;
                document.body.appendChild(script);
            };

            if (document.body) {
                injectJS();
            } else {
                window.addEventListener('DOMContentLoaded', injectJS);
            }
        }
    } else {
        // Fallback if no config element found
        window.SystemConfig = defaultConfig;
    }
} catch (e) {
    console.error('Failed to parse app config:', e);
    window.SystemConfig = defaultConfig;
}
