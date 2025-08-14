class NeuralTerminal {
    constructor() {
        this.outputElement = document.getElementById('terminal-output');
        this.inputElement = document.getElementById('terminal-command');
        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentPath = '/home/neural';
        this.fileSystem = this.createFileSystem();
        
        this.commands = {
            help: this.showHelp.bind(this),
            clear: this.clearTerminal.bind(this),
            ls: this.listDirectory.bind(this),
            cd: this.changeDirectory.bind(this),
            pwd: this.printWorkingDirectory.bind(this),
            cat: this.showFile.bind(this),
            whoami: this.whoAmI.bind(this),
            date: this.showDate.bind(this),
            neofetch: this.showSystemInfo.bind(this),
            matrix: this.runMatrix.bind(this),
            hack: this.runHackSequence.bind(this),
            neural: this.runNeuralNetwork.bind(this),
            glitch: this.runGlitchEffect.bind(this),
            echo: this.echo.bind(this)
        };
        
        this.init();
    }
    
    init() {
        this.inputElement.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.addOutput('Welcome to NeuralOS Terminal v2.1.47', 'system');
        this.addOutput('Type "help" for available commands.', 'system');
        this.addOutput('', 'normal');
    }
    
    createFileSystem() {
        return {
            '/home/neural': {
                type: 'directory',
                files: {
                    'readme.txt': {
                        type: 'file',
                        content: 'Welcome to the Neural Operating System.\n\nThis is a futuristic OS simulation built with modern web technologies.\n\nFeatures:\n- 3D Desktop Environment\n- Holographic Interface\n- AI-Powered Terminal\n- Real-time System Monitoring\n\nEnjoy exploring!'
                    },
                    'projects': {
                        type: 'directory',
                        files: {
                            'neural-net.py': {
                                type: 'file',
                                content: '#!/usr/bin/env python3\n\nimport numpy as np\nimport tensorflow as tf\n\nclass NeuralNetwork:\n    def __init__(self):\n        self.model = tf.keras.Sequential([\n            tf.keras.layers.Dense(128, activation="relu"),\n            tf.keras.layers.Dense(64, activation="relu"),\n            tf.keras.layers.Dense(10, activation="softmax")\n        ])\n    \n    def train(self, data):\n        print("Training neural network...")\n        # Training logic here\n        pass\n\nif __name__ == "__main__":\n    nn = NeuralNetwork()\n    print("Neural network initialized successfully!")'
                            },
                            'hologram.js': {
                                type: 'file',
                                content: '// Holographic display controller\n\nclass HologramDisplay {\n    constructor() {\n        this.projectors = 4;\n        this.resolution = "4K";\n        this.opacity = 0.8;\n    }\n    \n    activate() {\n        console.log("Hologram display activated");\n        this.renderHologram();\n    }\n    \n    renderHologram() {\n        // Hologram rendering logic\n        for (let i = 0; i < this.projectors; i++) {\n            this.activateProjector(i);\n        }\n    }\n}\n\nconst display = new HologramDisplay();\ndisplay.activate();'
                            }
                        }
                    },
                    'system': {
                        type: 'directory',
                        files: {
                            'config.json': {
                                type: 'file',
                                content: '{\n  "system": "NeuralOS",\n  "version": "2.1.47",\n  "kernel": "Quantum-Linux",\n  "architecture": "x64-neural",\n  "memory": "64GB DDR5",\n  "cpu": "Intel i9-13900K + Neural Processing Unit",\n  "gpu": "RTX 4090 Holographic Edition",\n  "theme": "cyberpunk-green",\n  "ai_assistant": "enabled",\n  "holographic_display": true\n}'
                            }
                        }
                    }
                }
            }
        };
    }
    
    handleKeyDown(event) {
        if (event.key === 'Enter') {
            const command = this.inputElement.value.trim();
            if (command) {
                this.commandHistory.push(command);
                this.historyIndex = this.commandHistory.length;
                this.executeCommand(command);
            }
            this.inputElement.value = '';
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.inputElement.value = this.commandHistory[this.historyIndex];
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
                this.inputElement.value = this.commandHistory[this.historyIndex];
            } else {
                this.historyIndex = this.commandHistory.length;
                this.inputElement.value = '';
            }
        } else if (event.key === 'Tab') {
            event.preventDefault();
            this.autoComplete();
        }
    }
    
    executeCommand(commandLine) {
        this.addOutput(`neural@os:${this.currentPath}$ ${commandLine}`, 'command');
        
        const parts = commandLine.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        if (this.commands[command]) {
            this.commands[command](args);
        } else {
            this.addOutput(`Command not found: ${command}`, 'error');
            this.addOutput('Type "help" for available commands.', 'hint');
        }
    }
    
    addOutput(text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        line.textContent = text;
        this.outputElement.appendChild(line);
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }
    
    showHelp() {
        const helpText = [
            'Available Commands:',
            '  help      - Show this help message',
            '  clear     - Clear the terminal',
            '  ls        - List directory contents',
            '  cd <dir>  - Change directory',
            '  pwd       - Print working directory',
            '  cat <file>- Display file contents',
            '  whoami    - Display current user',
            '  date      - Show current date and time',
            '  neofetch  - Display system information',
            '  matrix    - Run matrix animation',
            '  hack      - Run hacking simulation',
            '  neural    - Activate neural network',
            '  glitch    - Trigger glitch effect',
            '  echo <msg>- Echo a message',
            '',
            'Keyboard Shortcuts:',
            '  F1        - Toggle terminal',
            '  F2        - Toggle system monitor',
            '  ↑/↓       - Command history',
            '  Tab       - Auto-complete'
        ];
        
        helpText.forEach(line => this.addOutput(line, 'help'));
    }
    
    clearTerminal() {
        this.outputElement.innerHTML = '';
    }
    
    listDirectory(args) {
        const path = args[0] || this.currentPath;
        const dir = this.getDirectory(path);
        
        if (!dir) {
            this.addOutput(`ls: cannot access '${path}': No such directory`, 'error');
            return;
        }
        
        const files = Object.keys(dir.files);
        if (files.length === 0) {
            this.addOutput('(empty directory)', 'hint');
        } else {
            files.forEach(file => {
                const fileObj = dir.files[file];
                const prefix = fileObj.type === 'directory' ? 'd' : '-';
                const color = fileObj.type === 'directory' ? 'directory' : 'file';
                this.addOutput(`${prefix}rwxr-xr-x 1 neural neural ${file}`, color);
            });
        }
    }
    
    changeDirectory(args) {
        if (args.length === 0) {
            this.currentPath = '/home/neural';
            return;
        }
        
        const newPath = this.resolvePath(args[0]);
        const dir = this.getDirectory(newPath);
        
        if (!dir) {
            this.addOutput(`cd: no such directory: ${args[0]}`, 'error');
        } else {
            this.currentPath = newPath;
        }
    }
    
    printWorkingDirectory() {
        this.addOutput(this.currentPath, 'normal');
    }
    
    showFile(args) {
        if (args.length === 0) {
            this.addOutput('cat: missing file operand', 'error');
            return;
        }
        
        const filePath = this.resolvePath(args[0]);
        const file = this.getFile(filePath);
        
        if (!file) {
            this.addOutput(`cat: ${args[0]}: No such file`, 'error');
        } else if (file.type === 'directory') {
            this.addOutput(`cat: ${args[0]}: Is a directory`, 'error');
        } else {
            file.content.split('\n').forEach(line => {
                this.addOutput(line, 'file-content');
            });
        }
    }
    
    whoAmI() {
        this.addOutput('neural', 'normal');
    }
    
    showDate() {
        const now = new Date();
        this.addOutput(now.toString(), 'normal');
    }
    
    showSystemInfo() {
        const info = [
            '╭─────────────────────────────────╮',
            '│         NeuralOS v2.1.47        │',
            '╰─────────────────────────────────╯',
            '',
            '🖥️  OS: NeuralOS 2.1.47',
            '🔋 Kernel: Quantum-Linux 6.2.0-neural',
            '💾 Memory: 64GB DDR5-6400',
            '🧠 CPU: Intel i9-13900K + NPU',
            '🎮 GPU: RTX 4090 Holographic Ed.',
            '🌐 Network: Quantum Mesh',
            '⚡ Power: Fusion Cell (99%)',
            '🎨 Theme: Cyberpunk Green',
            '🤖 AI: Neural Assistant Online',
            ''
        ];
        
        info.forEach(line => this.addOutput(line, 'system-info'));
    }
    
    runMatrix() {
        this.addOutput('Initializing Matrix...', 'system');
        
        const matrixChars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        let counter = 0;
        
        const matrixInterval = setInterval(() => {
            let line = '';
            for (let i = 0; i < 60; i++) {
                line += matrixChars[Math.floor(Math.random() * matrixChars.length)];
            }
            this.addOutput(line, 'matrix');
            
            counter++;
            if (counter > 10) {
                clearInterval(matrixInterval);
                this.addOutput('Matrix simulation complete.', 'system');
            }
        }, 200);
    }
    
    runHackSequence() {
        const hackingMessages = [
            'Initializing hacking sequence...',
            'Scanning network topology...',
            'Found 127 active nodes',
            'Attempting to bypass firewall...',
            'Firewall bypassed successfully',
            'Gaining root access...',
            'Root access granted',
            'Downloading classified files...',
            'Download complete: 1337 files',
            'Covering tracks...',
            'Hack completed successfully!',
            'Remember: This is just a simulation! 😉'
        ];
        
        let index = 0;
        const hackInterval = setInterval(() => {
            if (index < hackingMessages.length) {
                this.addOutput(hackingMessages[index], index === hackingMessages.length - 1 ? 'hint' : 'hack');
                index++;
            } else {
                clearInterval(hackInterval);
            }
        }, 800);
    }
    
    runNeuralNetwork() {
        this.addOutput('Activating Neural Network...', 'system');
        
        const neuralMessages = [
            'Loading neural weights...',
            'Initializing 2048 neurons...',
            'Training on dataset: consciousness.db',
            'Epoch 1/∞: loss=0.0042',
            'Epoch 2/∞: loss=0.0031',
            'Epoch 3/∞: loss=0.0023',
            'Neural network convergence achieved',
            'AI consciousness level: 47%',
            'Neural network ready for queries'
        ];
        
        let index = 0;
        const neuralInterval = setInterval(() => {
            if (index < neuralMessages.length) {
                this.addOutput(neuralMessages[index], 'neural');
                index++;
            } else {
                clearInterval(neuralInterval);
            }
        }, 600);
    }
    
    runGlitchEffect() {
        this.addOutput('T̸r̵i̴g̶g̸e̷r̴i̵n̶g̸ ̶g̷l̴i̸t̷c̶h̸ ̵e̶f̷f̸e̵c̶t̸.̴.̶.̷', 'glitch');
        
        // Add some glitchy text
        const glitchTexts = [
            '01001000 01000101 01001100 01010000',
            'R̷̰͎̈́E̸̘̿Ä̵́L̴̰͒I̷̺̍T̶̰̄Y̸̭̾.̷̱̏E̸̹̊X̸̰̂E̶̝̿ ̶̱̈́H̸̰̃A̸̦͛S̸̰̈́ ̷̜̾S̸̭̈T̶̰̄O̷̱̚P̶̖̌P̴̰̌E̸̘̿D̶̜̈ ̷̱͌W̶̰̄O̷̖̚R̸̘̍K̷̖̂I̷̺̍N̶̦̈G̸̰̃',
            'S̴y̸s̶t̵e̷m̸ ̶i̴n̵t̶e̸g̴r̷i̴t̵y̶ ̸c̶o̴m̵p̷r̸o̸m̴i̶s̸e̵d̷',
            'G̷L̴I̵T̶C̸H̷ ̸M̶A̷T̴R̸I̵X̷ ̶A̴C̵T̶I̷V̸A̴T̸E̷D̸',
            'Normal operation resumed.'
        ];
        
        let index = 0;
        const glitchInterval = setInterval(() => {
            if (index < glitchTexts.length) {
                this.addOutput(glitchTexts[index], index === glitchTexts.length - 1 ? 'system' : 'glitch');
                index++;
            } else {
                clearInterval(glitchInterval);
            }
        }, 700);
    }
    
    echo(args) {
        this.addOutput(args.join(' '), 'normal');
    }
    
    // Helper methods
    resolvePath(path) {
        if (path.startsWith('/')) {
            return path;
        } else {
            return `${this.currentPath}/${path}`.replace(/\/+/g, '/');
        }
    }
    
    getDirectory(path) {
        const parts = path.split('/').filter(p => p);
        let current = this.fileSystem['/home/neural'];
        
        for (const part of parts.slice(2)) { // Skip 'home' and 'neural'
            if (current && current.files && current.files[part] && current.files[part].type === 'directory') {
                current = current.files[part];
            } else {
                return null;
            }
        }
        
        return current;
    }
    
    getFile(path) {
        const parts = path.split('/').filter(p => p);
        const fileName = parts.pop();
        const dirPath = '/' + parts.join('/');
        const dir = this.getDirectory(dirPath);
        
        return dir && dir.files && dir.files[fileName] ? dir.files[fileName] : null;
    }
    
    autoComplete() {
        const command = this.inputElement.value;
        const parts = command.split(' ');
        
        if (parts.length === 1) {
            // Complete command names
            const matches = Object.keys(this.commands).filter(cmd => cmd.startsWith(parts[0]));
            if (matches.length === 1) {
                this.inputElement.value = matches[0] + ' ';
            }
        }
        // Could add file/directory completion here
    }
}

// Add CSS styles for terminal output types
const terminalStyles = `
.terminal-line.command { color: #00ff88; font-weight: bold; }
.terminal-line.error { color: #ff4444; }
.terminal-line.hint { color: #888; font-style: italic; }
.terminal-line.help { color: #00ccff; }
.terminal-line.system { color: #ffaa00; }
.terminal-line.system-info { color: #00ff88; }
.terminal-line.directory { color: #00ccff; font-weight: bold; }
.terminal-line.file { color: #ffffff; }
.terminal-line.file-content { color: #cccccc; font-family: monospace; }
.terminal-line.matrix { color: #00ff00; font-family: monospace; }
.terminal-line.hack { color: #ff00ff; }
.terminal-line.neural { color: #00ffff; }
.terminal-line.glitch { 
    color: #ff0080; 
    animation: glitchText 0.3s infinite;
    font-family: monospace;
}

@keyframes glitchText {
    0% { transform: translateX(0); }
    20% { transform: translateX(-2px); }
    40% { transform: translateX(2px); }
    60% { transform: translateX(-1px); }
    80% { transform: translateX(1px); }
    100% { transform: translateX(0); }
}
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = terminalStyles;
document.head.appendChild(styleSheet);

// Initialize terminal
window.neuralTerminal = new NeuralTerminal();