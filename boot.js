class BootSequence {
    constructor() {
        this.canvas = document.getElementById('boot-particles');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.bootMessages = [
            'Initializing Neural Networks...',
            'Loading Quantum Processors...',
            'Calibrating Holographic Display...',
            'Establishing Matrix Connection...',
            'Activating AI Subsystems...',
            'Boot Sequence Complete.'
        ];
        this.currentMessageIndex = 0;
        this.bootComplete = false;
        
        this.resize();
        this.init();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    init() {
        // Create initial particles
        for (let i = 0; i < 100; i++) {
            this.createParticle();
        }
        
        // Start boot text cycling
        this.cycleBootText();
        
        // Start particle animation
        this.animate();
        
        // Complete boot after 6 seconds
        setTimeout(() => {
            this.completeBootSequence();
        }, 6000);
    }
    
    createParticle() {
        const particle = {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 3 + 1,
            opacity: Math.random() * 0.8 + 0.2,
            hue: Math.random() * 60 + 120, // Green to cyan range
            life: Math.random() * 100 + 50,
            maxLife: 150,
            connected: false
        };
        this.particles.push(particle);
    }
    
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Update life
            particle.life--;
            particle.opacity = particle.life / particle.maxLife;
            
            // Wrap around screen
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
            
            // Remove dead particles
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
                this.createParticle(); // Maintain particle count
            }
        }
    }
    
    drawParticles() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections first
        this.drawConnections();
        
        // Draw particles
        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.opacity;
            this.ctx.fillStyle = `hsl(${particle.hue}, 100%, 60%)`;
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = `hsl(${particle.hue}, 100%, 60%)`;
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    }
    
    drawConnections() {
        const connectionDistance = 150;
        
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const particle1 = this.particles[i];
                const particle2 = this.particles[j];
                
                const dx = particle1.x - particle2.x;
                const dy = particle1.y - particle2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < connectionDistance) {
                    const opacity = (1 - distance / connectionDistance) * 0.3;
                    
                    this.ctx.save();
                    this.ctx.globalAlpha = opacity;
                    this.ctx.strokeStyle = '#00ff88';
                    this.ctx.lineWidth = 1;
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#00ff88';
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(particle1.x, particle1.y);
                    this.ctx.lineTo(particle2.x, particle2.y);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            }
        }
    }
    
    cycleBootText() {
        const bootTextElement = document.querySelector('.boot-text');
        
        const updateText = () => {
            if (this.currentMessageIndex < this.bootMessages.length && !this.bootComplete) {
                bootTextElement.textContent = this.bootMessages[this.currentMessageIndex];
                this.currentMessageIndex++;
                setTimeout(updateText, 1000);
            }
        };
        
        updateText();
    }
    
    animate() {
        if (!this.bootComplete) {
            this.updateParticles();
            this.drawParticles();
            requestAnimationFrame(() => this.animate());
        }
    }
    
    completeBootSequence() {
        this.bootComplete = true;
        const bootScreen = document.getElementById('boot-screen');
        const desktop = document.getElementById('desktop');
        
        // Add completion effect
        this.addCompletionEffect();
        
        setTimeout(() => {
            bootScreen.classList.add('hidden');
            desktop.classList.remove('hidden');
            
            // Initialize desktop
            if (window.desktopManager) {
                window.desktopManager.init();
            }
        }, 2000);
    }
    
    addCompletionEffect() {
        // Create explosion of particles from center
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        for (let i = 0; i < 50; i++) {
            const angle = (Math.PI * 2 * i) / 50;
            const speed = Math.random() * 10 + 5;
            
            this.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 5 + 2,
                opacity: 1,
                hue: Math.random() * 60 + 120,
                life: 60,
                maxLife: 60
            });
        }
        
        // Animate completion effect
        const animateCompletion = () => {
            this.updateParticles();
            this.drawParticles();
            
            if (this.particles.length > 0) {
                requestAnimationFrame(animateCompletion);
            }
        };
        
        animateCompletion();
    }
}

// Initialize boot sequence when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.bootSequence = new BootSequence();
});