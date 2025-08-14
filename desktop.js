class DesktopManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = document.getElementById('desktop-canvas');
        this.backgroundMesh = null;
        this.floatingObjects = [];
        this.mouseX = 0;
        this.mouseY = 0;
        this.time = 0;
        
        this.setupEventListeners();
    }
    
    init() {
        this.setupThreeJS();
        this.createBackground();
        this.createFloatingObjects();
        this.animate();
        this.updateSystemInfo();
    }
    
    setupThreeJS() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x000011, 10, 100);
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas, 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0);
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(ambientLight);
        
        const pointLight = new THREE.PointLight(0x00ff88, 1, 100);
        pointLight.position.set(0, 0, 10);
        this.scene.add(pointLight);
    }
    
    createBackground() {
        // Create animated grid background
        const geometry = new THREE.PlaneGeometry(50, 50, 50, 50);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                mouse: { value: new THREE.Vector2(0, 0) }
            },
            vertexShader: `
                uniform float time;
                uniform vec2 mouse;
                varying vec2 vUv;
                varying vec3 vPosition;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    
                    vec3 pos = position;
                    float wave1 = sin(pos.x * 0.5 + time * 2.0) * 0.1;
                    float wave2 = sin(pos.y * 0.3 + time * 1.5) * 0.1;
                    pos.z += wave1 + wave2;
                    
                    // Mouse interaction
                    float mouseInfluence = 1.0 - distance(pos.xy, mouse * 10.0) * 0.1;
                    pos.z += mouseInfluence * 0.2;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec2 resolution;
                varying vec2 vUv;
                varying vec3 vPosition;
                
                void main() {
                    vec2 st = vUv;
                    
                    // Grid pattern
                    vec2 grid = abs(fract(st * 20.0) - 0.5);
                    float line = smoothstep(0.0, 0.1, grid.x) * smoothstep(0.0, 0.1, grid.y);
                    line = 1.0 - line;
                    
                    // Animated colors
                    vec3 color1 = vec3(0.0, 1.0, 0.5);  // Cyan-green
                    vec3 color2 = vec3(0.0, 0.5, 1.0);  // Blue
                    
                    float colorMix = sin(time * 0.5 + vPosition.x * 0.1) * 0.5 + 0.5;
                    vec3 finalColor = mix(color1, color2, colorMix);
                    
                    // Distance fade
                    float dist = distance(vPosition.xy, vec2(0.0));
                    float fade = 1.0 - smoothstep(5.0, 25.0, dist);
                    
                    gl_FragColor = vec4(finalColor * line * fade * 0.3, line * fade * 0.3);
                }
            `,
            transparent: true,
            wireframe: false
        });
        
        this.backgroundMesh = new THREE.Mesh(geometry, material);
        this.backgroundMesh.rotation.x = -Math.PI / 2;
        this.backgroundMesh.position.y = -5;
        this.scene.add(this.backgroundMesh);
    }
    
    createFloatingObjects() {
        // Create floating geometric objects
        const geometries = [
            new THREE.OctahedronGeometry(0.5),
            new THREE.TetrahedronGeometry(0.5),
            new THREE.IcosahedronGeometry(0.5),
            new THREE.DodecahedronGeometry(0.5)
        ];
        
        for (let i = 0; i < 15; i++) {
            const geometry = geometries[Math.floor(Math.random() * geometries.length)];
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(Math.random() * 0.3 + 0.3, 1, 0.5),
                transparent: true,
                opacity: 0.7,
                wireframe: Math.random() > 0.5
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Random position
            mesh.position.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 10
            );
            
            // Random rotation speed
            mesh.userData = {
                rotationSpeed: {
                    x: (Math.random() - 0.5) * 0.02,
                    y: (Math.random() - 0.5) * 0.02,
                    z: (Math.random() - 0.5) * 0.02
                },
                floatSpeed: Math.random() * 0.005 + 0.002,
                floatOffset: Math.random() * Math.PI * 2
            };
            
            this.floatingObjects.push(mesh);
            this.scene.add(mesh);
        }
    }
    
    setupEventListeners() {
        // Mouse movement for camera interaction
        document.addEventListener('mousemove', (event) => {
            this.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            
            if (this.backgroundMesh) {
                this.backgroundMesh.material.uniforms.resolution.value = new THREE.Vector2(window.innerWidth, window.innerHeight);
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            switch(event.code) {
                case 'F1':
                    event.preventDefault();
                    this.togglePanel('terminal');
                    break;
                case 'F2':
                    event.preventDefault();
                    this.togglePanel('system');
                    break;
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.time += 0.01;
        
        // Update background shader
        if (this.backgroundMesh) {
            this.backgroundMesh.material.uniforms.time.value = this.time;
            this.backgroundMesh.material.uniforms.mouse.value = new THREE.Vector2(this.mouseX, this.mouseY);
        }
        
        // Update floating objects
        this.floatingObjects.forEach(obj => {
            obj.rotation.x += obj.userData.rotationSpeed.x;
            obj.rotation.y += obj.userData.rotationSpeed.y;
            obj.rotation.z += obj.userData.rotationSpeed.z;
            
            // Floating animation
            obj.position.y += Math.sin(this.time * obj.userData.floatSpeed + obj.userData.floatOffset) * 0.01;
        });
        
        // Camera movement based on mouse
        this.camera.position.x += (this.mouseX * 2 - this.camera.position.x) * 0.05;
        this.camera.position.y += (this.mouseY * 2 - this.camera.position.y) * 0.05;
        this.camera.lookAt(this.scene.position);
        
        this.renderer.render(this.scene, this.camera);
    }
    
    togglePanel(panelType) {
        const panel = document.querySelector(`[data-panel="${panelType}"]`);
        if (panel) {
            panel.classList.toggle('active');
        }
    }
    
    updateSystemInfo() {
        const updateTime = () => {
            const now = new Date();
            const timeElement = document.getElementById('time');
            const dateElement = document.getElementById('date');
            
            if (timeElement) {
                timeElement.textContent = now.toLocaleTimeString('en-US', { 
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            
            if (dateElement) {
                dateElement.textContent = `Neural.${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
            }
        };
        
        const updateStats = () => {
            // Simulate system stats
            const cpuUsage = Math.random() * 30 + 10;
            const memoryUsage = Math.random() * 40 + 30;
            const neuralLoad = Math.random() * 60 + 20;
            
            const cpuFill = document.querySelector('[data-stat="cpu"]');
            const memoryFill = document.querySelector('[data-stat="memory"]');
            const neuralFill = document.querySelector('[data-stat="neural"]');
            
            const cpuValue = document.getElementById('cpu-value');
            const memoryValue = document.getElementById('memory-value');
            const neuralValue = document.getElementById('neural-value');
            
            if (cpuFill && cpuValue) {
                cpuFill.style.width = `${cpuUsage}%`;
                cpuValue.textContent = `${Math.round(cpuUsage)}%`;
            }
            
            if (memoryFill && memoryValue) {
                memoryFill.style.width = `${memoryUsage}%`;
                memoryValue.textContent = `${Math.round(memoryUsage)}%`;
            }
            
            if (neuralFill && neuralValue) {
                neuralFill.style.width = `${neuralLoad}%`;
                neuralValue.textContent = `${Math.round(neuralLoad)}%`;
            }
        };
        
        // Update time every second
        updateTime();
        setInterval(updateTime, 1000);
        
        // Update stats every 2 seconds
        updateStats();
        setInterval(updateStats, 2000);
    }
}

// Initialize desktop manager
window.desktopManager = new DesktopManager();