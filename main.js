// Main application controller
class NeuralOSController {
    constructor() {
        this.panels = {
            terminal: false,
            system: false
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupPanelControls();
        this.initializeAudioContext();
    }
    
    setupEventListeners() {
        // Neural button click
        const neuralButton = document.querySelector('.neural-button');
        if (neuralButton) {
            neuralButton.addEventListener('click', () => {
                this.showStartMenu();
            });
        }
        
        // Global keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // Prevent default browser shortcuts when our UI is active
            if (event.target.tagName !== 'INPUT') {
                switch(event.code) {
                    case 'F1':
                        event.preventDefault();
                        this.togglePanel('terminal');
                        break;
                    case 'F2':
                        event.preventDefault();
                        this.togglePanel('system');
                        break;
                    case 'Escape':
                        this.closeAllPanels();
                        break;
                }
            }
        });
        
        // Click outside panels to close
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.panel') && !event.target.closest('.neural-button')) {
                // Don't close if clicking on terminal input
                if (event.target.id !== 'terminal-command') {
                    this.closeAllPanels();
                }
            }
        });
    }
    
    setupPanelControls() {
        // Panel dragging
        document.querySelectorAll('.panel-header').forEach(header => {
            let isDragging = false;
            let startX, startY, startLeft, startTop;
            
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.panel-controls')) return;
                
                isDragging = true;
                const panel = header.closest('.panel');
                const rect = panel.getBoundingClientRect();
                
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;
                
                panel.style.zIndex = '1000';
                
                const handleMouseMove = (e) => {
                    if (!isDragging) return;
                    
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;
                    
                    panel.style.left = `${startLeft + deltaX}px`;
                    panel.style.top = `${startTop + deltaY}px`;
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                };
                
                const handleMouseUp = () => {
                    isDragging = false;
                    panel.style.zIndex = '';
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });
        });
        
        // Panel controls
        document.querySelectorAll('.panel-controls span').forEach(control => {
            control.addEventListener('click', (e) => {
                const panel = e.target.closest('.panel');
                const action = e.target.className;
                
                switch(action) {
                    case 'minimize':
                        this.minimizePanel(panel);
                        break;
                    case 'maximize':
                        this.maximizePanel(panel);
                        break;
                    case 'close':
                        this.closePanel(panel);
                        break;
                }
            });
        });
    }
    
    togglePanel(panelType) {
        const panel = document.querySelector(`[data-panel="${panelType}"]`);
        if (!panel) return;
        
        if (this.panels[panelType]) {
            this.closePanel(panel);
        } else {
            this.openPanel(panel);
            
            // Focus terminal input if opening terminal
            if (panelType === 'terminal') {
                setTimeout(() => {
                    const terminalInput = document.getElementById('terminal-command');
                    if (terminalInput) {
                        terminalInput.focus();
                    }
                }, 300);
            }
        }
        
        this.panels[panelType] = !this.panels[panelType];
    }
    
    openPanel(panel) {
        panel.classList.add('active');
        this.playSound('open');
    }
    
    closePanel(panel) {
        panel.classList.remove('active');
        const panelType = panel.getAttribute('data-panel');
        this.panels[panelType] = false;
        this.playSound('close');
    }
    
    closeAllPanels() {
        document.querySelectorAll('.panel').forEach(panel => {
            this.closePanel(panel);
        });
    }
    
    minimizePanel(panel) {
        panel.style.transform = 'scale(0.1) translateY(200px)';
        panel.style.opacity = '0';
        setTimeout(() => {
            panel.classList.remove('active');
            panel.style.transform = '';
            panel.style.opacity = '';
        }, 300);
        
        const panelType = panel.getAttribute('data-panel');
        this.panels[panelType] = false;
        this.playSound('minimize');
    }
    
    maximizePanel(panel) {
        if (panel.classList.contains('maximized')) {
            // Restore
            panel.classList.remove('maximized');
            panel.style.width = '';
            panel.style.height = '';
            panel.style.top = '';
            panel.style.left = '';
            panel.style.right = '';
            panel.style.bottom = '';
        } else {
            // Maximize
            panel.classList.add('maximized');
            panel.style.width = '90vw';
            panel.style.height = '90vh';
            panel.style.top = '5vh';
            panel.style.left = '5vw';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }
        this.playSound('maximize');
    }
    
    showStartMenu() {
        // Create temporary start menu
        const existingMenu = document.querySelector('.start-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }
        
        const startMenu = document.createElement('div');
        startMenu.className = 'start-menu';
        startMenu.innerHTML = `
            <div class="start-menu-header">
                <h3>Neural Applications</h3>
            </div>
            <div class="start-menu-items">
                <div class="start-menu-item" data-action="terminal">
                    <span class="menu-icon">💻</span>
                    <span>Neural Terminal</span>
                </div>
                <div class="start-menu-item" data-action="system">
                    <span class="menu-icon">📊</span>
                    <span>System Monitor</span>
                </div>
                <div class="start-menu-item" data-action="glitch">
                    <span class="menu-icon">⚡</span>
                    <span>Glitch Effect</span>
                </div>
                <div class="start-menu-item" data-action="matrix">
                    <span class="menu-icon">🔢</span>
                    <span>Matrix Mode</span>
                </div>
            </div>
        `;
        
        // Style the start menu
        startMenu.style.cssText = `
            position: absolute;
            bottom: 70px;
            left: 20px;
            width: 250px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid rgba(0, 255, 136, 0.5);
            border-radius: 10px;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px rgba(0, 255, 136, 0.2);
            z-index: 1001;
            animation: slideUp 0.3s ease;
        `;
        
        // Add menu item styles
        const menuStyles = `
            .start-menu-header {
                padding: 15px 20px;
                border-bottom: 1px solid rgba(0, 255, 136, 0.3);
                color: #00ff88;
                font-weight: bold;
            }
            .start-menu-items {
                padding: 10px;
            }
            .start-menu-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px;
                border-radius: 5px;
                cursor: pointer;
                transition: all 0.3s ease;
                color: #ffffff;
            }
            .start-menu-item:hover {
                background: rgba(0, 255, 136, 0.2);
                transform: translateX(5px);
            }
            .menu-icon {
                font-size: 1.2rem;
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        
        if (!document.querySelector('#start-menu-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'start-menu-styles';
            styleSheet.textContent = menuStyles;
            document.head.appendChild(styleSheet);
        }
        
        document.body.appendChild(startMenu);
        
        // Add click handlers
        startMenu.querySelectorAll('.start-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                this.handleStartMenuAction(action);
                startMenu.remove();
            });
        });
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeStartMenu(e) {
                if (!startMenu.contains(e.target) && !e.target.closest('.neural-button')) {
                    startMenu.remove();
                    document.removeEventListener('click', closeStartMenu);
                }
            });
        }, 100);
        
        this.playSound('open');
    }
    
    handleStartMenuAction(action) {
        switch(action) {
            case 'terminal':
                this.togglePanel('terminal');
                break;
            case 'system':
                this.togglePanel('system');
                break;
            case 'glitch':
                this.triggerGlitchEffect();
                break;
            case 'matrix':
                this.triggerMatrixEffect();
                break;
        }
    }
    
    triggerGlitchEffect() {
        document.body.style.filter = 'hue-rotate(180deg) saturate(2)';
        setTimeout(() => {
            document.body.style.filter = 'hue-rotate(90deg) contrast(1.5)';
        }, 200);
        setTimeout(() => {
            document.body.style.filter = '';
        }, 400);
        
        this.playSound('glitch');
    }
    
    triggerMatrixEffect() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 10000;
            pointer-events: none;
        `;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const ctx = canvas.getContext('2d');
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const drops = [];
        
        for (let x = 0; x < canvas.width / 20; x++) {
            drops[x] = Math.random() * canvas.height;
        }
        
        document.body.appendChild(canvas);
        
        const drawMatrix = () => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#00ff00';
            ctx.font = '20px monospace';
            
            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(text, i * 20, drops[i]);
                drops[i] += 20;
                
                if (drops[i] > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
            }
        };
        
        const matrixInterval = setInterval(drawMatrix, 50);
        
        setTimeout(() => {
            clearInterval(matrixInterval);
            canvas.remove();
        }, 5000);
        
        this.playSound('matrix');
    }
    
    initializeAudioContext() {
        // Create audio context for sound effects
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio context not supported');
        }
    }
    
    playSound(type) {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        let frequency, duration;
        
        switch(type) {
            case 'open':
                frequency = 800;
                duration = 0.2;
                break;
            case 'close':
                frequency = 600;
                duration = 0.15;
                break;
            case 'minimize':
                frequency = 400;
                duration = 0.1;
                break;
            case 'maximize':
                frequency = 1000;
                duration = 0.25;
                break;
            case 'glitch':
                frequency = 200;
                duration = 0.3;
                break;
            case 'matrix':
                frequency = 1200;
                duration = 0.4;
                break;
            default:
                frequency = 440;
                duration = 0.1;
        }
        
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }
}

// Initialize the main controller when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.neuralOSController = new NeuralOSController();
    
    // Easter egg: Konami code
    let konamiCode = [];
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA
    
    document.addEventListener('keydown', (e) => {
        konamiCode.push(e.keyCode);
        konamiCode = konamiCode.slice(-10);
        
        if (konamiCode.join(',') === konami.join(',')) {
            // Activate special mode
            document.body.style.animation = 'rainbow 2s infinite';
            if (window.neuralTerminal) {
                window.neuralTerminal.addOutput('🎉 KONAMI CODE ACTIVATED! 🎉', 'system');
                window.neuralTerminal.addOutput('You found the easter egg!', 'help');
            }
        }
    });
    
    // Add rainbow animation
    const rainbowCSS = `
        @keyframes rainbow {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
        }
    `;
    
    const rainbowStyle = document.createElement('style');
    rainbowStyle.textContent = rainbowCSS;
    document.head.appendChild(rainbowStyle);
});