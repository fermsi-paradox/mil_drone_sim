/**
 * Military Drone Swarm Simulation
 * A lightweight Three.js simulation that visualizes a swarm of drones
 * with basic swarm behavior rules, ground-based enemies, and detection mechanics.
 */

// Force recon mode to be always enabled
console.log("Loading simulation with recon mode always enabled");

// Global parameters
const params = {
    // Simulation state
    isRunning: false,
    isPaused: false,
    overlayRemoved: false,
    
    // Scene settings
    mapSize: 20,
    
    // Lighting
    ambientLightIntensity: 0.4,
    directionalLightIntensity: 0.8,
    
    // Camera
    cameraPosition: { x: 0, y: 20, z: 20 },
    
    // Obstacles
    obstacleCount: 20,
    minObstacleSize: 4.5,
    maxObstacleSize: 9,
    
    // Reconnaissance mode - ALWAYS ENABLED
    reconModeEnabled: true,  // No longer configurable - always true
    reconFormationSpread: 3.0, // How spread out drones will be in recon formation
    reconPatternChange: 15000, // Milliseconds before changing recon pattern
    
    // Drone settings
    droneCount: 20,
    droneSize: 0.2,
    droneSpeed: 0.05,
    droneColors: [0x2385F8, 0x36D965, 0xFFCB4C, 0xFF5733],
    droneMinAltitude: 3,   // Minimum flying height
    detectionRange: 5,     // How far drones can detect enemies
    droneHealth: 100,      // Hit points for each drone
    communicationRange: 12, // How far drones can communicate with each other
    searchPatternSize: 8,  // Size of the search pattern when no enemies detected
    collisionDamage: 30,   // Damage when hitting an obstacle
    collisionCooldown: 1000, // Milliseconds before taking collision damage again
    
    // Behavior weights
    searchWeight: 0.5,       // Search behavior when no enemies are detected
    cohesionWeight: 1.0,     // Attraction to enemies
    separationWeight: 1.5,   // Repulsion from other drones
    avoidanceWeight: 2.0,    // Obstacle avoidance strength
    
    // New search parameters
    searchAggressiveness: 0.7,  // How aggressively drones search (higher = more movement)
    searchAreaCoverage: 0.8,    // Percentage of map drones will try to cover
    searchPatternVariation: 3,  // Variety in search patterns (1-5)
    dynamicPatternChange: true, // Whether drones dynamically change patterns
    
    // Enemy settings
    enemyCount: 10,          // Number of ground enemies
    enemySize: 0.4,
    enemyColor: 0xFF0000,
    enemyShootingRange: 8,   // How far enemies can shoot
    enemyShootingRate: 2000, // Milliseconds between shots
    enemyShootingEnabled: true,
    enemyShootingDamage: 25, // Damage per hit
    
    // Environment settings
    groundSize: 30,         // Size of the ground plane (slightly larger than map)
    
    // View settings
    cameraPosition: { x: 0, y: 20, z: 20 },
    ambientLightIntensity: 0.4,
    directionalLightIntensity: 0.8,
    
    // Simulation state
    isRunning: false,       // Whether the simulation is currently running
    isPaused: false,         // Whether the simulation is paused
    overlayRemoved: false   // Track if overlay has been removed
};

// Main classes
class Drone {
    constructor(id, position) {
        // Create drone mesh (small sphere)
        const geometry = new THREE.SphereGeometry(params.droneSize, 8, 8);
        const material = new THREE.MeshLambertMaterial({ 
            color: params.droneColors[id % params.droneColors.length]
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        
        // Physics properties
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.1
        );
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = params.droneSpeed;
        this.id = id;
        this.health = params.droneHealth;
        this.isAlive = true;
        this.lastCollisionTime = 0; // Track when the drone last collided
        this.missileLoaded = true;  // Whether drone has a missile ready to fire
        
        // Knowledge base
        this.knownEnemies = new Map(); // Map of enemy IDs to last known positions
        this.lastSearchDirection = Math.random() * Math.PI * 2; // Random initial search direction
        this.searchTime = Math.random() * 100; // Random initial search time
        
        // Enhanced search properties
        this.searchPattern = id % params.searchPatternVariation; // Different search patterns
        this.patternChangeTimer = Math.random() * 5000; // Random initial timer
        this.patternDirection = Math.random() > 0.5 ? 1 : -1; // Direction of pattern
        this.searchPhase = Math.random() * Math.PI * 2; // Phase offset for patterns
        this.targetSearchPoint = new THREE.Vector3(); // Current target point to search
        this.searchSpeed = params.droneSpeed * (0.8 + Math.random() * 0.4); // Slightly varied speeds
        
        // Reconnaissance properties
        this.reconQuadrant = id % 4; // Divide drones into 4 quadrants for better coverage
        this.reconAltitudeOffset = (id % 3) * 0.5; // Vary altitude slightly between drones
        this.lastPatternChangeTime = performance.now();
        this.reconFormationPosition = new THREE.Vector3(); // Position in the recon formation
        this.updateReconFormationPosition();
        
        // Create detection bubble
        const bubbleGeometry = new THREE.SphereGeometry(params.detectionRange, 16, 12);
        const bubbleMaterial = new THREE.MeshBasicMaterial({
            color: 0x88CCFF,
            transparent: true,
            opacity: 0.15,
            wireframe: false
        });
        this.detectionBubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
        this.detectionBubble.userData.drone = this;
        this.detectionBubble.visible = true;
        this.mesh.add(this.detectionBubble);
        
        // Create communication range indicator (invisible by default)
        const commGeometry = new THREE.SphereGeometry(params.communicationRange, 16, 8);
        const commMaterial = new THREE.MeshBasicMaterial({
            color: 0x88FF88,
            transparent: true,
            opacity: 0.05,
            wireframe: true
        });
        this.communicationBubble = new THREE.Mesh(commGeometry, commMaterial);
        this.communicationBubble.visible = false; // Only show briefly when communicating
        this.mesh.add(this.communicationBubble);
        
        // Target tracking for improved obstacle avoidance
        this.currentTarget = null;        // Current target position (if any)
        this.hasDirectPathToTarget = false; // Whether there's a clear path to target
    }
    
    applyForce(force) {
        // F = ma, but we assume mass = 1
        this.acceleration.add(force);
    }
    
    update() {
        if (!this.isAlive) return;
        
        // Update velocity and position based on physics
        this.velocity.add(this.acceleration);
        
        // Limit speed
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.maxSpeed);
        }
        
        // Update position
        this.mesh.position.add(this.velocity);
        
        // Reset acceleration
        this.acceleration.set(0, 0, 0);
        
        // Rotate drone to face direction of movement
        if (this.velocity.length() > 0.01) {
            this.mesh.lookAt(
                this.mesh.position.x + this.velocity.x,
                this.mesh.position.y + this.velocity.y,
                this.mesh.position.z + this.velocity.z
            );
        }
        
        // Update detection bubble size
        this.detectionBubble.scale.set(1, 1, 1);
        
        // Update search time
        this.searchTime += 0.01;
        
        // Forget old enemy positions after some time
        this.updateKnowledge();
    }
    
    // Keep drone within boundaries and above minimum altitude
    enforceBoundaries() {
        if (!this.isAlive) return;
        
        const margin = 2;
        const bound = params.mapSize / 2 - margin;
        const bounceForce = 0.05;
        
        if (this.mesh.position.x > bound) {
            this.applyForce(new THREE.Vector3(-bounceForce, 0, 0));
        } else if (this.mesh.position.x < -bound) {
            this.applyForce(new THREE.Vector3(bounceForce, 0, 0));
        }
        
        // Enforce minimum altitude more strongly
        if (this.mesh.position.y < params.droneMinAltitude) {
            this.applyForce(new THREE.Vector3(0, bounceForce * 2, 0));
        } else if (this.mesh.position.y > bound) {
            this.applyForce(new THREE.Vector3(0, -bounceForce, 0));
        }
        
        if (this.mesh.position.z > bound) {
            this.applyForce(new THREE.Vector3(0, 0, -bounceForce));
        } else if (this.mesh.position.z < -bound) {
            this.applyForce(new THREE.Vector3(0, 0, bounceForce));
        }
    }
    
    // Update knowledge base of enemy positions
    updateKnowledge() {
        // Forget old enemy positions after 10 seconds
        const currentTime = performance.now();
        for (const [enemyId, info] of this.knownEnemies.entries()) {
            if (currentTime - info.timestamp > 10000) {
                this.knownEnemies.delete(enemyId);
            }
        }
    }
    
    // Detect enemies and return detected enemies
    detectEnemies(enemies, drones) {
        if (!this.isAlive) return [];
        
        const detectedEnemies = [];
        const currentTime = performance.now();
        
        // Check all enemies
        enemies.forEach(enemy => {
            const distance = this.mesh.position.distanceTo(enemy.mesh.position);
            
            // If enemy is within detection range
            if (distance <= params.detectionRange) {
                detectedEnemies.push(enemy);
                
                // Add to knowledge base (for individual drone)
                this.knownEnemies.set(enemy.id, {
                    position: enemy.mesh.position.clone(),
                    timestamp: currentTime
                });
            }
        });
        
        return detectedEnemies;
    }
    
    // Share knowledge with nearby drones
    shareKnowledge(drones) {
        // Method kept for compatibility but no longer actively used
        // Swarm-level knowledge sharing happens in DroneSimulation.shareSwarmKnowledge()
    }
    
    // Flash communication bubble to visualize drone communication
    flashCommunication() {
        this.communicationBubble.visible = true;
        setTimeout(() => {
            this.communicationBubble.visible = false;
        }, 300);
    }
    
    // Get search direction when no enemies are known
    getSearchDirection() {
        // Always use recon mode's smarter patterns
        return this.getReconSearchDirection();
        
        // Legacy code removed - no longer supporting non-recon mode
    }
    
    // New method for improved basic search patterns
    getEnhancedSearchDirection() {
        // Update search time
        this.searchTime += 0.02;
        this.patternChangeTimer -= 16.7; // Approx milliseconds per frame at 60fps
        
        // Change direction occasionally based on aggressiveness
        if (this.patternChangeTimer <= 0 || (Math.random() < 0.001 * params.searchAggressiveness)) {
            this.lastSearchDirection += (Math.random() - 0.5) * Math.PI * params.searchAggressiveness;
            this.patternDirection = Math.random() > 0.5 ? 1 : -1;
            this.patternChangeTimer = 3000 + Math.random() * 5000; // 3-8 seconds
            this.searchPhase = Math.random() * Math.PI * 2;
            
            // Occasionally select a completely new random direction
            if (Math.random() < 0.3) {
                this.lastSearchDirection = Math.random() * Math.PI * 2;
            }
        }
        
        // Calculate search pattern based on selected pattern type
        let x, z;
        const mapSize = params.mapSize * params.searchAreaCoverage;
        
        switch(this.searchPattern) {
            case 0: // Sine wave pattern
                x = Math.cos(this.lastSearchDirection) * Math.sin(this.searchTime * 0.1) * mapSize * 0.4;
                z = Math.sin(this.lastSearchDirection) * Math.sin(this.searchTime * 0.1) * mapSize * 0.4;
                break;
                
            case 1: // Spiral pattern
                const spiralRadius = Math.min(mapSize/2, (this.searchTime % 20) * 0.1 * mapSize/2);
                const angle = this.searchTime * 0.3 * this.patternDirection + this.searchPhase;
                x = Math.cos(angle) * spiralRadius;
                z = Math.sin(angle) * spiralRadius;
                break;
                
            case 2: // Zigzag pattern
                const zigzagProgress = (this.searchTime * 0.05) % 2;
                const zigzagWidth = mapSize * 0.6;
                x = Math.cos(this.lastSearchDirection) * (zigzagProgress < 1 ? zigzagProgress : 2 - zigzagProgress) * zigzagWidth;
                z = Math.sin(this.lastSearchDirection) * this.searchTime * 0.02 * this.patternDirection * mapSize * 0.3;
                break;
                
            default: // Random waypoint
                // Change waypoint periodically
                if (this.patternChangeTimer <= 0 || this.targetSearchPoint.lengthSq() === 0) {
                    this.targetSearchPoint.set(
                        (Math.random() - 0.5) * mapSize,
                        params.droneMinAltitude + Math.random() * 2,
                        (Math.random() - 0.5) * mapSize
                    );
                }
                
                // Return direction toward target waypoint
                return new THREE.Vector3()
                    .subVectors(this.targetSearchPoint, this.mesh.position)
                    .normalize()
                    .multiplyScalar(0.5 + params.searchAggressiveness * 0.5);
        }
        
        // Create search vector with some vertical variation for more natural movement
        const direction = new THREE.Vector3(
            x - this.mesh.position.x, 
            Math.sin(this.searchTime * 0.3) * 0.5, // Slight vertical movement
            z - this.mesh.position.z
        );
        
        return direction.normalize().multiplyScalar(0.5 + params.searchAggressiveness * 0.5);
    }
    
    // Get search direction optimized for reconnaissance
    getReconSearchDirection() {
        const currentTime = performance.now();
        
        // Update formation position periodically or when too far from target area
        if (currentTime - this.lastPatternChangeTime > params.reconPatternChange || 
            this.mesh.position.distanceTo(this.reconFormationPosition) > params.mapSize * 0.7) {
            this.updateReconFormationPosition();
            this.lastPatternChangeTime = currentTime;
        }
        
        // Calculate distance to formation position
        const distanceToFormation = this.mesh.position.distanceTo(this.reconFormationPosition);
        
        // If drone is far from its assigned area, move more directly toward it
        if (distanceToFormation > params.mapSize * 0.3) {
            const toFormation = new THREE.Vector3().subVectors(this.reconFormationPosition, this.mesh.position);
            return toFormation.normalize();
        }
        
        // Otherwise, perform a more thorough search within assigned area
        this.searchTime += 0.01;
        
        // Create search pattern within the assigned zone
        const searchRadius = params.reconFormationSpread * 2;
        const angle = this.searchTime * 0.2 * this.patternDirection + this.searchPhase;
        const offsetX = Math.cos(angle) * searchRadius * Math.min(1, params.searchAggressiveness * 1.5);
        const offsetZ = Math.sin(angle) * searchRadius * Math.min(1, params.searchAggressiveness * 1.5);
        
        // Target position is the formation position plus the search pattern offset
        const targetPos = new THREE.Vector3(
            this.reconFormationPosition.x + offsetX,
            this.reconFormationPosition.y + Math.sin(this.searchTime * 0.4) * 1.0, // Some altitude variation
            this.reconFormationPosition.z + offsetZ
        );
        
        // Direction toward the target position
        const direction = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
        
        // Add some small random movements to make it look more natural
        const randomFactor = 0.3;
        direction.x += (Math.random() - 0.5) * randomFactor;
        direction.z += (Math.random() - 0.5) * randomFactor;
        
        return direction.normalize();
    }
    
    // Update the drone's position in the reconnaissance formation
    updateReconFormationPosition() {
        const mapRadius = params.mapSize / 2 * 0.9; // Use 90% of the map for the formation
        
        // Calculate base angle based on quadrant (0, 90, 180, 270 degrees)
        const baseAngle = (this.reconQuadrant * Math.PI / 2); 
        
        // Calculate a spread angle within the quadrant based on drone ID
        const spreadFactor = params.reconFormationSpread;
        const angleSpread = (Math.PI / 4) * spreadFactor;
        
        // Assign different patrol areas within the quadrant 
        // We divide each quadrant into sub-areas for better coverage
        const droneQuadrantCount = Math.ceil(params.droneCount / 4); // Drones per quadrant
        const subQuadrantIndex = Math.floor(this.id / 4) % droneQuadrantCount;
        const subQuadrantAngle = angleSpread * (subQuadrantIndex / droneQuadrantCount);
        
        const spreadAngle = baseAngle + (Math.random() - 0.5) * 0.2 + subQuadrantAngle;
        
        // Distribute drones throughout the radius, not just on the edge
        // Use a more dynamic distribution pattern based on ID to cover more area
        const distanceFactor = 0.3 + 0.7 * (Math.sin(this.id * 0.7) * 0.5 + 0.5);
        const distance = mapRadius * distanceFactor;
        
        // Set the recon formation position, including some randomness for natural movement
        this.reconFormationPosition.set(
            Math.cos(spreadAngle) * distance + (Math.random() - 0.5) * 2,
            params.droneMinAltitude + this.reconAltitudeOffset + (Math.random() - 0.5),
            Math.sin(spreadAngle) * distance + (Math.random() - 0.5) * 2
        );
        
        // Reset pattern direction and phase when changing formation
        this.patternDirection = Math.random() > 0.5 ? 1 : -1;
        this.searchPhase = Math.random() * Math.PI * 2;
    }
    
    // Take damage and show visual feedback
    takeDamage(amount) {
        if (!this.isAlive) return;
        
        this.health -= amount;
        
        // Visual feedback for damage
        this.mesh.material.emissive = new THREE.Color(0xFF0000);
        this.mesh.material.emissiveIntensity = 1.0 - (this.health / params.droneHealth);
        
        // Flash the drone red
        this.showDamageFlash();
        
        if (this.health <= 0) {
            this.destroy();
        }
    }
    
    // Collision with obstacle
    collideWithObstacle(obstacle, collisionSpeed) {
        // Only take damage if enough time has passed since the last collision
        const currentTime = performance.now();
        if (currentTime - this.lastCollisionTime < params.collisionCooldown) {
            return;
        }
        
        // Calculate damage based on collision speed
        const speedFactor = Math.min(collisionSpeed / params.droneSpeed, 2.0);
        const damage = params.collisionDamage * speedFactor;
        
        // Apply damage
        this.takeDamage(damage);
        this.lastCollisionTime = currentTime;
        
        // Bounce effect - reverse velocity
        this.velocity.multiplyScalar(-0.5);
        
        // Create a collision particle effect
        this.showCollisionEffect(obstacle);
    }
    
    // Show a flash when drone takes damage
    showDamageFlash() {
        // Save original color
        const originalColor = this.mesh.material.color.clone();
        const originalEmissive = this.mesh.material.emissive.clone();
        
        // Flash bright red
        this.mesh.material.emissive = new THREE.Color(0xFF0000);
        this.mesh.material.emissiveIntensity = 1.0;
        
        // Reset after a short time
        setTimeout(() => {
            this.mesh.material.emissive = originalEmissive;
            this.mesh.material.emissiveIntensity = 1.0 - (this.health / params.droneHealth);
        }, 150);
    }
    
    // Show visual effect for collision
    showCollisionEffect(obstacle) {
        // Calculate collision point (midpoint between drone and obstacle surface)
        const collisionPoint = this.mesh.position.clone();
        
        // Create a simple particle burst
        const particleCount = 10;
        const particles = [];
        
        // Create particles in a temporary group
        const particleGroup = new THREE.Group();
        this.mesh.parent.add(particleGroup);
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(params.droneSize * 0.2, 4, 4);
            const particleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xFFCC00,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(collisionPoint);
            
            // Random velocity
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                Math.random() * 0.1,
                (Math.random() - 0.5) * 0.1
            );
            
            particleGroup.add(particle);
            particles.push(particle);
        }
        
        // Animate particles
        let frame = 0;
        const maxFrames = 20;
        
        const animateParticles = () => {
            if (frame >= maxFrames) {
                // Remove particles after animation is complete
                particles.forEach(p => particleGroup.remove(p));
                this.mesh.parent.remove(particleGroup);
                return;
            }
            
            particles.forEach(p => {
                p.position.add(p.velocity);
                p.material.opacity = 0.8 * (1 - frame / maxFrames);
                p.scale.multiplyScalar(0.95);
            });
            
            frame++;
            requestAnimationFrame(animateParticles);
        };
        
        animateParticles();
    }
    
    destroy() {
        this.isAlive = false;
        this.mesh.material.opacity = 0.3;
        this.mesh.material.transparent = true;
        this.mesh.material.color.set(0x444444);
        this.detectionBubble.visible = false;
        this.communicationBubble.visible = false;
        
        // Drone falls to the ground when destroyed
        this.velocity.set(0, -0.05, 0);
    }
}

class Enemy {
    constructor(id, position) {
        // Create enemy mesh (box for tanks/vehicles)
        const bodyGeometry = new THREE.BoxGeometry(params.enemySize * 1.5, params.enemySize, params.enemySize * 2);
        const turretGeometry = new THREE.CylinderGeometry(params.enemySize * 0.4, params.enemySize * 0.4, params.enemySize * 0.8, 8);
        const barrelGeometry = new THREE.CylinderGeometry(params.enemySize * 0.1, params.enemySize * 0.1, params.enemySize * 1.2, 8);
        
        const material = new THREE.MeshLambertMaterial({ color: params.enemyColor });
        const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x880000 });
        
        // Create the main body
        this.body = new THREE.Mesh(bodyGeometry, material);
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        
        // Create the turret
        this.turret = new THREE.Mesh(turretGeometry, darkMaterial);
        this.turret.rotation.x = Math.PI / 2;
        this.turret.position.y = params.enemySize * 0.5;
        this.body.add(this.turret);
        
        // Create the barrel
        this.barrel = new THREE.Mesh(barrelGeometry, darkMaterial);
        this.barrel.position.z = params.enemySize * 0.6;
        this.turret.add(this.barrel);
        
        // Group for the entire enemy
        this.mesh = new THREE.Group();
        this.mesh.add(this.body);
        this.mesh.position.copy(position);
        
        // Enemy properties
        this.id = id;
        this.visible = false;
        this.lastShotTime = 0;
        this.targetDrone = null;
        this.canShoot = params.enemyShootingEnabled;
        this.isDestroyed = false;  // New property to track if enemy is destroyed
        
        // Movement properties
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = 0.02 + Math.random() * 0.01; // Random speed for variety
        this.movementState = 'patrolling'; // patrolling, hiding, pursuing
        this.targetPosition = null;
        this.pathUpdateTime = 0;
        this.pathUpdateInterval = 3000 + Math.random() * 2000; // Random time between path updates
        this.lastObstacleCheck = 0;
        this.isInsideObstacle = false;
        this.preferredObstacle = null;
        this.insideObstacleTimer = 0;
        this.maxTimeInObstacle = 15000 + Math.random() * 10000; // Max time to stay inside obstacle
        
        // Intelligence properties
        this.detectedByDrones = new Set(); // Set of drone IDs that detected this enemy
        this.lastDetectionTime = 0; // Time of last detection by any drone
        this.threatLevel = 0; // Increases when targeted by drones
        
        // Make the whole enemy invisible initially
        this.setVisibility(false);
    }
    
    update(time, drones, obstacles, swarmKnowledge) {
        // Skip update if destroyed
        if (this.isDestroyed) return;
        
        // Check if enemy is detected by any drone
        this.updateDetectionStatus(drones, time);
        
        // Determine behavior state
        this.updateBehaviorState(time, drones, obstacles, swarmKnowledge);
        
        // Execute behavior based on state
        switch (this.movementState) {
            case 'hiding':
                this.executeHidingBehavior(obstacles);
                break;
            case 'pursuing':
                this.executePursuingBehavior(drones);
                break;
            case 'patrolling':
                this.executePatrollingBehavior();
                break;
        }
        
        // Apply physics
        this.updateMovement();
        
        // Find closest alive drone in shooting range for potential attack
        let closestDrone = null;
        let closestDistance = Infinity;
        let isDetected = false;
        
        drones.forEach(drone => {
            if (!drone.isAlive) return;
            
            // Check if enemy is within any drone's detection bubble
            const distance = this.mesh.position.distanceTo(drone.mesh.position);
            if (distance <= params.detectionRange) {
                isDetected = true;
            }
            
            // Find closest drone for shooting
            if (distance < closestDistance && distance <= params.enemyShootingRange) {
                closestDistance = distance;
                closestDrone = drone;
            }
        });
        
        // Update visibility based on detection
        this.setVisibility(isDetected);
        
        // If no drones are in range or shooting is disabled, do nothing
        if (!closestDrone || !this.canShoot || !params.enemyShootingEnabled) {
            this.targetDrone = null;
            return;
        }
        
        // Target found, aim at it
        this.targetDrone = closestDrone;
        this.aimAt(closestDrone.mesh.position);
        
        // Shoot if enough time has passed since last shot
        if (time - this.lastShotTime > params.enemyShootingRate) {
            this.shoot();
            this.lastShotTime = time;
        }
    }
    
    updateMovement() {
        // Add acceleration to velocity
        this.velocity.add(this.acceleration);
        
        // Limit speed
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.maxSpeed);
        }
        
        // Calculate next position (but don't move yet - check for collisions first)
        const nextPosition = {
            x: this.mesh.position.x + this.velocity.x,
            y: this.mesh.position.y,
            z: this.mesh.position.z + this.velocity.z
        };
        
        // Check for obstacle collisions at the next position
        const obstacles = window.droneSimulation.obstacles;
        let willCollide = false;
        
        // Enemy body dimensions for collision detection
        const enemyWidth = params.enemySize * 1.5;
        const enemyLength = params.enemySize * 2;
        const enemyRadius = Math.max(enemyWidth, enemyLength) * 0.5;
        
        for (const obstacle of obstacles) {
            // Get obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Simplified collision detection using cylinder vs. box
            // Calculate horizontal distance between enemy center and obstacle center
            const dx = nextPosition.x - obstacle.position.x;
            const dz = nextPosition.z - obstacle.position.z;
            const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
            
            // Calculate minimum distance needed to avoid collision
            // Half obstacle width/depth (approximated as radius) + enemy radius
            const obstacleRadius = Math.max(size.x, size.z) * 0.5;
            const minDistance = obstacleRadius + enemyRadius;
            
            if (horizontalDistance < minDistance) {
                willCollide = true;
                break;
            }
        }
        
        if (willCollide) {
            // Don't update position, and apply avoidance force
            this.avoidObstacles(obstacles);
            
            // Reduce velocity to help with avoiding obstacles
            this.velocity.multiplyScalar(0.8);
        } else {
            // No collision, update position
            this.mesh.position.x = nextPosition.x;
            this.mesh.position.z = nextPosition.z;
        }
        
        // Reset acceleration
        this.acceleration.set(0, 0, 0);
        
        // Rotate enemy to face direction of movement if moving fast enough
        if (this.velocity.length() > 0.001) {
            // Calculate target rotation to face movement direction
            const angle = Math.atan2(this.velocity.x, this.velocity.z);
            // Apply rotation to the body only (turret rotation is handled separately)
            this.body.rotation.y = angle;
        }
    }
    
    applyForce(force) {
        // F = ma, but we assume mass = 1
        this.acceleration.add(force);
    }
    
    updateDetectionStatus(drones, time) {
        // Clear previous detection status
        const wasDetected = this.detectedByDrones.size > 0;
        this.detectedByDrones.clear();
        
        // Check which drones can see this enemy
        drones.forEach(drone => {
            if (!drone.isAlive) return;
            
            const distance = this.mesh.position.distanceTo(drone.mesh.position);
            if (distance <= params.detectionRange) {
                this.detectedByDrones.add(drone.id);
                this.lastDetectionTime = time;
            }
        });
        
        // If newly detected, increase threat level
        if (!wasDetected && this.detectedByDrones.size > 0) {
            this.threatLevel += 0.5;
        }
    }
    
    updateBehaviorState(time, drones, obstacles, swarmKnowledge) {
        const currentTime = time;
        
        // Check if it's time to update path/behavior
        if (currentTime - this.pathUpdateTime < this.pathUpdateInterval) {
            return; // Not time to update yet
        }
        
        this.pathUpdateTime = currentTime;
        
        // Decision logic for behavior state
        if (this.detectedByDrones.size > 0) {
            // Enemy is currently detected - decide between hiding and pursuing
            if (this.threatLevel > 1.5 || this.detectedByDrones.size >= 2) {
                // High threat - seek to hide
                this.movementState = 'hiding';
                
                // Find a suitable obstacle to hide in/behind
                const hidingSpot = this.findHidingSpot(obstacles, drones);
                if (hidingSpot) {
                    this.targetPosition = hidingSpot;
                    this.preferredObstacle = hidingSpot.obstacle;
                }
            } else {
                // Low threat - opportunistically pursue lone drones
                const vulnerableDrone = this.findVulnerableDrone(drones);
                if (vulnerableDrone) {
                    this.movementState = 'pursuing';
                    this.targetPosition = vulnerableDrone.mesh.position.clone();
                } else {
                    // No vulnerable drones, better hide
                    this.movementState = 'hiding';
                    const hidingSpot = this.findHidingSpot(obstacles, drones);
                    if (hidingSpot) {
                        this.targetPosition = hidingSpot;
                        this.preferredObstacle = hidingSpot.obstacle;
                        // Ensure we're not trying to move inside obstacles
                        this.isInsideObstacle = false;
                    }
                }
            }
        } else {
            // Not currently detected
            if (currentTime - this.lastDetectionTime > 10000) {
                // Not detected for a while, can patrol more freely
                this.threatLevel = Math.max(0, this.threatLevel - 0.5); // Reduce threat level over time
                
                // Decide whether to move elsewhere or stay hidden
                if (this.isInsideObstacle) {
                    // If inside obstacle for too long, consider moving
                    if (currentTime - this.insideObstacleTimer > this.maxTimeInObstacle) {
                        this.movementState = 'patrolling';
                        this.isInsideObstacle = false;
                    }
                } else {
                    // Not inside - patrol or find hiding spot based on recent detection
                    if (currentTime - this.lastDetectionTime > 20000) {
                        // No detection for a long time, free to patrol
                        this.movementState = 'patrolling';
                        this.targetPosition = this.getRandomPatrolPoint();
                    } else {
                        // Was detected recently, better find a new hiding spot
                        this.movementState = 'hiding';
                        const hidingSpot = this.findHidingSpot(obstacles, drones);
                        if (hidingSpot) {
                            this.targetPosition = hidingSpot;
                            this.preferredObstacle = hidingSpot.obstacle;
                            // Ensure we're not trying to move inside obstacles
                            this.isInsideObstacle = false;
                        }
                    }
                }
            }
        }
        
        // Always have a valid target position
        if (!this.targetPosition) {
            this.targetPosition = this.getRandomPatrolPoint();
            this.movementState = 'patrolling';
        }
    }
    
    executeHidingBehavior(obstacles) {
        if (!this.targetPosition) return;
        
        // Check if reached the target
        const distanceToTarget = this.mesh.position.distanceTo(this.targetPosition);
        
        if (distanceToTarget < 0.5) {
            // Target reached - just hide here, don't move inside
            this.velocity.set(0, 0, 0);
            // Reset the inside obstacle flag in case it was set
            this.isInsideObstacle = false;
        } else {
            // Apply obstacle avoidance during movement to hiding spot
            this.avoidObstacles(obstacles);
            
            // Move toward hiding spot
            const direction = new THREE.Vector3()
                .subVectors(this.targetPosition, this.mesh.position)
                .normalize();
            
            this.applyForce(direction.multiplyScalar(0.002));
        }
    }
    
    executePursuingBehavior(drones) {
        // If no target position or target drone destroyed, get new target
        if (!this.targetPosition || 
            (this.targetDrone && !this.targetDrone.isAlive)) {
            const vulnerableDrone = this.findVulnerableDrone(drones);
            if (vulnerableDrone) {
                this.targetPosition = vulnerableDrone.mesh.position.clone();
                this.targetDrone = vulnerableDrone;
            } else {
                // No vulnerable drones, switch to patrolling
                this.movementState = 'patrolling';
                this.targetPosition = this.getRandomPatrolPoint();
                return;
            }
        }
        
        // If pursuing an active drone, update target position to its current position
        if (this.targetDrone && this.targetDrone.isAlive) {
            this.targetPosition = this.targetDrone.mesh.position.clone();
        }
        
        // Apply obstacle avoidance
        this.avoidObstacles(window.droneSimulation.obstacles);
        
        // Move toward target
        const direction = new THREE.Vector3()
            .subVectors(this.targetPosition, this.mesh.position)
            .normalize();
        
        // Only use X and Z components for ground movement
        direction.y = 0;
        
        this.applyForce(direction.multiplyScalar(0.001));
        
        // If close to target and it's a drone, increase movement speed for interception
        const distanceToTarget = this.mesh.position.distanceTo(this.targetPosition);
        if (distanceToTarget < params.enemyShootingRange * 0.7) {
            this.applyForce(direction.multiplyScalar(0.001));
        }
    }
    
    executePatrollingBehavior() {
        if (!this.targetPosition) {
            this.targetPosition = this.getRandomPatrolPoint();
        }
        
        const distanceToTarget = this.mesh.position.distanceTo(this.targetPosition);
        
        if (distanceToTarget < 1.0) {
            // Target reached, get a new one
            this.targetPosition = this.getRandomPatrolPoint();
        }
        
        // Apply obstacle avoidance
        this.avoidObstacles(window.droneSimulation.obstacles);
        
        // Move toward patrol point
        const direction = new THREE.Vector3()
            .subVectors(this.targetPosition, this.mesh.position)
            .normalize();
        
        this.applyForce(direction.multiplyScalar(0.0008)); // Slower than pursuing
    }
    
    getRandomPatrolPoint() {
        const bound = params.mapSize / 2 - 3;
        let position = null;
        let attempts = 0;
        
        // Keep trying random positions until we find one that doesn't collide with obstacles
        // or until we've tried too many times
        while (position === null && attempts < 10) {
            const candidate = new THREE.Vector3(
                (Math.random() - 0.5) * bound * 1.8,
                0.3, // Slightly above ground
                (Math.random() - 0.5) * bound * 1.8
            );
            
            // Check if this position is clear of obstacles
            if (this.isPositionClear(candidate, window.droneSimulation.obstacles)) {
                position = candidate;
            }
            
            attempts++;
        }
        
        // If we couldn't find a clear position, just return any position
        // (obstacle avoidance during movement will handle it)
        if (position === null) {
            position = new THREE.Vector3(
                (Math.random() - 0.5) * bound * 1.8,
                0.3,
                (Math.random() - 0.5) * bound * 1.8
            );
        }
        
        return position;
    }
    
    findVulnerableDrone(drones) {
        // Look for isolated drones or damaged drones
        let mostVulnerableDrone = null;
        let highestVulnerabilityScore = -1;
        
        drones.forEach(drone => {
            if (!drone.isAlive) return;
            
            const distance = this.mesh.position.distanceTo(drone.mesh.position);
            if (distance > params.enemyShootingRange * 2) return; // Too far
            
            // Calculate how isolated this drone is from others
            let isolationScore = 0;
            let nearbyDrones = 0;
            
            drones.forEach(otherDrone => {
                if (otherDrone.id !== drone.id && otherDrone.isAlive) {
                    const otherDistance = drone.mesh.position.distanceTo(otherDrone.mesh.position);
                    if (otherDistance < params.communicationRange / 2) {
                        nearbyDrones++;
                    }
                }
            });
            
            isolationScore = 3 - Math.min(nearbyDrones, 3); // 0-3 score, higher = more isolated
            
            // Calculate damage factor (more damaged = more vulnerable)
            const damageFactor = 1 - (drone.health / params.droneHealth);
            
            // Overall vulnerability score
            const vulnerabilityScore = isolationScore * 0.6 + damageFactor * 0.4;
            
            if (vulnerabilityScore > highestVulnerabilityScore) {
                highestVulnerabilityScore = vulnerabilityScore;
                mostVulnerableDrone = drone;
            }
        });
        
        return mostVulnerableDrone;
    }
    
    findHidingSpot(obstacles, drones) {
        if (obstacles.length === 0) return null;
        
        let bestObstacle = null;
        let bestScore = -Infinity;
        let bestPosition = null;
        
        // Calculate the centroid of all drones that can detect this enemy
        const dronePositions = [];
        drones.forEach(drone => {
            if (this.detectedByDrones.has(drone.id)) {
                dronePositions.push(drone.mesh.position);
            }
        });
        
        if (dronePositions.length === 0) {
            // If no drones are detecting, use the closest drone position
            let closestDrone = null;
            let closestDistance = Infinity;
            
            drones.forEach(drone => {
                if (drone.isAlive) {
                    const distance = this.mesh.position.distanceTo(drone.mesh.position);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestDrone = drone;
                    }
                }
            });
            
            if (closestDrone) {
                dronePositions.push(closestDrone.mesh.position);
            } else {
                // No drones at all? Just pick a random position near an obstacle
                const randomObstacle = obstacles[Math.floor(Math.random() * obstacles.length)];
                const size = new THREE.Vector3();
                randomObstacle.geometry.computeBoundingBox();
                randomObstacle.geometry.boundingBox.getSize(size);
                
                // Calculate a position OUTSIDE the obstacle
                const randomDir = new THREE.Vector3(
                    Math.random() - 0.5,
                    0,
                    Math.random() - 0.5
                ).normalize();
                
                const hidingDistance = Math.max(size.x, size.z) * 0.6 + 1.0; // Add buffer to stay outside
                const position = new THREE.Vector3()
                    .addVectors(
                        randomObstacle.position,
                        randomDir.multiplyScalar(hidingDistance)
                    );
                
                // Check if this position is valid (not inside any obstacle)
                if (this.isPositionClear(position, obstacles)) {
                    return {
                        x: position.x,
                        y: 0.3,
                        z: position.z,
                        obstacle: randomObstacle
                    };
                } else {
                    // If position is inside an obstacle, try again with a different direction
                    for (let attempt = 0; attempt < 8; attempt++) {
                        const newAngle = Math.random() * Math.PI * 2;
                        const newDir = new THREE.Vector3(
                            Math.cos(newAngle),
                            0,
                            Math.sin(newAngle)
                        );
                        
                        const newPosition = new THREE.Vector3()
                            .addVectors(
                                randomObstacle.position,
                                newDir.multiplyScalar(hidingDistance)
                            );
                        
                        if (this.isPositionClear(newPosition, obstacles)) {
                            return {
                                x: newPosition.x,
                                y: 0.3,
                                z: newPosition.z,
                                obstacle: randomObstacle
                            };
                        }
                    }
                    
                    // If all attempts failed, just return a position farther away
                    const farPosition = new THREE.Vector3()
                        .addVectors(
                            randomObstacle.position,
                            randomDir.multiplyScalar(hidingDistance * 2)
                        );
                    
                    return {
                        x: farPosition.x,
                        y: 0.3,
                        z: farPosition.z,
                        obstacle: randomObstacle
                    };
                }
            }
        }
        
        // Calculate average drone position
        const avgDronePosition = new THREE.Vector3();
        dronePositions.forEach(pos => {
            avgDronePosition.add(pos);
        });
        avgDronePosition.divideScalar(dronePositions.length);
        
        // Evaluate each obstacle
        obstacles.forEach(obstacle => {
            // Calculate obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Calculate position on opposite side of obstacle from drones
            const obstacleToEnemy = new THREE.Vector3().subVectors(
                this.mesh.position, obstacle.position
            ).normalize();
            
            const obstacleToAvgDrone = new THREE.Vector3().subVectors(
                avgDronePosition, obstacle.position
            ).normalize();
            
            // Dot product measures how much these vectors point in opposite directions
            // Higher negative value means better hiding position (opposite sides)
            const directionScore = -obstacleToEnemy.dot(obstacleToAvgDrone);
            
            // Distance factor - closer obstacles are better but not too close
            const distance = this.mesh.position.distanceTo(obstacle.position);
            const distanceScore = 1.0 / (Math.abs(distance - 5) + 1);
            
            // Size factor - larger obstacles provide better cover
            const sizeScore = (size.x + size.z) / 10;
            
            // Calculate final score
            const score = directionScore * 0.5 + distanceScore * 0.3 + sizeScore * 0.2;
            
            if (score > bestScore) {
                bestScore = score;
                bestObstacle = obstacle;
                
                // Calculate position near the obstacle on the opposite side from drones
                const oppositeDir = new THREE.Vector3()
                    .subVectors(obstacle.position, avgDronePosition)
                    .normalize();
                
                // Position it at the edge of the obstacle with some buffer to stay outside
                const obstacleRadius = Math.max(size.x, size.z) * 0.5;
                const hidingDistance = obstacleRadius + 1.0; // Add 1.0 unit buffer to ensure it's outside
                bestPosition = new THREE.Vector3()
                    .addVectors(
                        obstacle.position,
                        oppositeDir.multiplyScalar(hidingDistance)
                    );
                
                // Add some randomness to avoid enemies clustering in the same spot
                bestPosition.x += (Math.random() - 0.5) * 1.5;
                bestPosition.z += (Math.random() - 0.5) * 1.5;
                
                // Keep Y coordinate at ground level
                bestPosition.y = 0.3;
            }
        });
        
        if (bestPosition && bestObstacle) {
            // Check if the best position is clear (not inside any obstacle)
            if (!this.isPositionClear(bestPosition, obstacles)) {
                // If position conflicts with another obstacle, try to find a clear position
                for (let attempt = 0; attempt < 8; attempt++) {
                    // Add more randomness to find a clear spot
                    const adjustedPosition = bestPosition.clone();
                    adjustedPosition.x += (Math.random() - 0.5) * 3;
                    adjustedPosition.z += (Math.random() - 0.5) * 3;
                    
                    if (this.isPositionClear(adjustedPosition, obstacles)) {
                        return {
                            x: adjustedPosition.x,
                            y: bestPosition.y,
                            z: adjustedPosition.z,
                            obstacle: bestObstacle
                        };
                    }
                }
                
                // If all attempts failed, try a position farther from the obstacle
                const size = new THREE.Vector3();
                bestObstacle.geometry.computeBoundingBox();
                bestObstacle.geometry.boundingBox.getSize(size);
                
                const obstacleRadius = Math.max(size.x, size.z) * 0.5;
                const oppositeDir = new THREE.Vector3()
                    .subVectors(bestPosition, bestObstacle.position)
                    .normalize();
                
                const farPosition = new THREE.Vector3()
                    .addVectors(
                        bestObstacle.position,
                        oppositeDir.multiplyScalar(obstacleRadius + 2.5)
                    );
                
                return {
                    x: farPosition.x,
                    y: 0.3,
                    z: farPosition.z,
                    obstacle: bestObstacle
                };
            }
            
            return {
                x: bestPosition.x,
                y: bestPosition.y,
                z: bestPosition.z,
                obstacle: bestObstacle
            };
        }
        
        return null;
    }
    
    // Helper method to check if a position is clear of obstacles
    isPositionClear(position, obstacles) {
        // Enemy dimensions for collision detection
        const enemyRadius = Math.max(params.enemySize * 1.5, params.enemySize * 2) * 0.5;
        
        for (const obstacle of obstacles) {
            // Get obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Calculate horizontal distance between enemy center and obstacle center
            const dx = position.x - obstacle.position.x;
            const dz = position.z - obstacle.position.z;
            const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
            
            // Calculate minimum distance needed to avoid collision
            const obstacleRadius = Math.max(size.x, size.z) * 0.5;
            const minDistance = obstacleRadius + enemyRadius;
            
            if (horizontalDistance < minDistance) {
                return false; // Position is too close to an obstacle
            }
        }
        
        return true; // Position is clear
    }
    
    // We're no longer going to use this method since we don't want enemies inside obstacles
    moveInsideObstacle(obstacle) {
        // This method is now modified to position the enemy behind the obstacle instead
        
        // Calculate obstacle dimensions
        const size = new THREE.Vector3();
        obstacle.geometry.computeBoundingBox();
        obstacle.geometry.boundingBox.getSize(size);
        
        // Reset the inside obstacle flag - we don't want enemies hiding inside
        this.isInsideObstacle = false;
        
        // Find the closest drone to determine which side to hide on
        let closestDrone = null;
        let closestDistance = Infinity;
        
        for (const droneId of this.detectedByDrones) {
            const drone = window.droneSimulation.drones.find(d => d.id === droneId);
            if (drone && drone.isAlive) {
                const distance = this.mesh.position.distanceTo(drone.mesh.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestDrone = drone;
                }
            }
        }
        
        if (!closestDrone) return; // No drones to hide from
        
        // Calculate direction away from closest drone
        const awayFromDrone = new THREE.Vector3()
            .subVectors(obstacle.position, closestDrone.mesh.position)
            .normalize();
        
        // Position behind obstacle from the drone's perspective
        const hidingDistance = Math.max(size.x, size.z) * 0.5 + 1.0; // Add buffer
        const hidePosition = new THREE.Vector3()
            .addVectors(
                obstacle.position,
                awayFromDrone.multiplyScalar(hidingDistance)
            );
        
        // Add some random offset
        hidePosition.x += (Math.random() - 0.5) * 1.0;
        hidePosition.z += (Math.random() - 0.5) * 1.0;
        
        // Keep Y at ground level
        hidePosition.y = 0.3;
        
        // Check if the position is clear of other obstacles
        if (this.isPositionClear(hidePosition, window.droneSimulation.obstacles)) {
            // Move to this position
            this.mesh.position.copy(hidePosition);
            
            // Reduce velocity
            this.velocity.multiplyScalar(0.5);
        } else {
            // If position conflicts with another obstacle, try to find a clear position
            for (let attempt = 0; attempt < 8; attempt++) {
                // Add more randomness to find a clear spot
                const adjustedPosition = hidePosition.clone();
                adjustedPosition.x += (Math.random() - 0.5) * 3;
                adjustedPosition.z += (Math.random() - 0.5) * 3;
                
                if (this.isPositionClear(adjustedPosition, window.droneSimulation.obstacles)) {
                    this.mesh.position.copy(adjustedPosition);
                    this.velocity.multiplyScalar(0.5);
                    return;
                }
            }
            
            // If all attempts failed, just don't move
            this.velocity.set(0, 0, 0);
        }
    }
    
    aimAt(position) {
        // Calculate direction to target
        const direction = new THREE.Vector3().subVectors(position, this.mesh.position);
        
        // Calculate rotation for turret (y-axis rotation)
        this.turret.rotation.z = Math.atan2(direction.x, direction.z);
        
        // Calculate barrel elevation (x-axis rotation)
        const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
        const angle = Math.atan2(direction.y, horizontalDistance);
        this.barrel.rotation.x = angle;
    }
    
    shoot() {
        if (!this.targetDrone || !this.targetDrone.isAlive) return;
        
        // Get positions for line of sight check
        const start = new THREE.Vector3();
        this.barrel.getWorldPosition(start);
        const end = this.targetDrone.mesh.position.clone();
        
        // Check if there's a clear line of sight to the target
        const simulation = window.droneSimulation;
        const hasLineOfSight = simulation.checkLineOfSight(start, end);
        
        // Create a laser beam effect
        let laserEnd = end;
        let hitObstacle = null;
        
        // If no line of sight, find where the laser hits an obstacle
        if (!hasLineOfSight) {
            // Direction vector from start to end
            const direction = new THREE.Vector3().subVectors(end, start).normalize();
            
            // Distance between the points
            const distance = start.distanceTo(end);
            
            // Create a raycaster to find the intersection point
            const raycaster = new THREE.Raycaster(start, direction, 0.1, distance);
            const intersects = raycaster.intersectObjects(simulation.obstacles);
            
            if (intersects.length > 0) {
                // Get the closest intersection
                const intersection = intersects[0];
                laserEnd = intersection.point;
                hitObstacle = intersection.object;
            }
        }
        
        // Create the laser geometry from start to the endpoint (either target or obstacle)
        const laserGeometry = new THREE.BufferGeometry().setFromPoints([start, laserEnd]);
        const laserMaterial = new THREE.LineBasicMaterial({ 
            color: 0xFF0000, 
            linewidth: 3 
        });
        
        const laser = new THREE.Line(laserGeometry, laserMaterial);
        this.mesh.parent.add(laser);
        
        // Keep track of all active lasers in the simulation
        if (!simulation.activeLasers) {
            simulation.activeLasers = [];
        }
        simulation.activeLasers.push(laser);
        
        // Only inflict damage if we have line of sight
        if (hasLineOfSight) {
            this.targetDrone.takeDamage(params.enemyShootingDamage);
        } else if (hitObstacle) {
            // Show impact effect on the obstacle
            this.showLaserImpact(laserEnd, hitObstacle);
        }
        
        // Remove laser effect after a short time
        // Store a reference to the parent to ensure proper removal
        const parent = this.mesh.parent;
        setTimeout(() => {
            if (parent && laser.parent === parent) {
                parent.remove(laser);
                // Dispose of geometry and material to prevent memory leaks
                laserGeometry.dispose();
                laserMaterial.dispose();
                
                // Also remove from the activeLasers array
                if (simulation.activeLasers) {
                    const index = simulation.activeLasers.indexOf(laser);
                    if (index !== -1) {
                        simulation.activeLasers.splice(index, 1);
                    }
                }
            }
        }, 100);
    }
    
    // New method to show laser impact on obstacles
    showLaserImpact(position, obstacle) {
        // Create a small particle effect at impact point
        const impactGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const impactMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFF5500,
            transparent: true,
            opacity: 0.8
        });
        
        const impact = new THREE.Mesh(impactGeometry, impactMaterial);
        impact.position.copy(position);
        this.mesh.parent.add(impact);
        
        // Animate and remove
        let scale = 1.0;
        const animateImpact = () => {
            scale *= 0.9;
            impact.scale.set(scale, scale, scale);
            impact.material.opacity *= 0.9;
            
            if (scale > 0.05) {
                requestAnimationFrame(animateImpact);
            } else {
                // Remove from scene
                if (impact.parent) {
                    impact.parent.remove(impact);
                    impactGeometry.dispose();
                    impactMaterial.dispose();
                }
            }
        };
        
        // Start animation
        animateImpact();
    }
    
    setVisibility(visible) {
        // Always make enemy visible based on detection, regardless of obstacle proximity
        // Remove the isInsideObstacle check that was forcing invisibility
        this.visible = visible;
        this.body.visible = visible;
    }
    
    // New method to handle being hit by a missile
    destroyEnemy() {
        if (this.isDestroyed) return;
        
        this.isDestroyed = true;
        
        // Visual effect for destruction
        const explosionGeometry = new THREE.SphereGeometry(2, 16, 16);
        const explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF5500,
            transparent: true,
            opacity: 0.8
        });
        
        const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
        explosion.position.copy(this.mesh.position);
        this.mesh.parent.add(explosion);
        
        // Hide the enemy
        this.setVisibility(false);
        
        // Animate explosion and then remove
        let scale = 1.0;
        const expandAndFade = () => {
            scale += 0.2;
            explosion.scale.set(scale, scale, scale);
            explosionMaterial.opacity -= 0.05;
            
            if (explosionMaterial.opacity > 0) {
                requestAnimationFrame(expandAndFade);
            } else {
                this.mesh.parent.remove(explosion);
                explosionGeometry.dispose();
                explosionMaterial.dispose();
            }
        };
        
        expandAndFade();
    }
    
    // New method to handle obstacle avoidance
    avoidObstacles(obstacles) {
        const avoidanceForce = new THREE.Vector3(0, 0, 0);
        const position = this.mesh.position;
        
        // Enemy dimensions
        const enemyRadius = Math.max(params.enemySize * 1.5, params.enemySize * 2) * 0.5;
        // Avoidance distance: how far from obstacles the enemy tries to stay
        const avoidanceDistance = enemyRadius + 1.5;
        
        obstacles.forEach(obstacle => {
            // Get obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Calculate obstacle "radius" (half of the maximum dimension)
            const obstacleRadius = Math.max(size.x, size.z) * 0.5;
            
            // Vector from obstacle to enemy
            const obstaclePos = obstacle.position;
            const dx = position.x - obstaclePos.x;
            const dz = position.z - obstaclePos.z;
            
            // Horizontal distance
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // If we're within avoidance range
            const minDistance = obstacleRadius + avoidanceDistance;
            if (distance < minDistance) {
                // Calculate avoidance vector (away from obstacle)
                let avoidX = dx;
                let avoidZ = dz;
                
                // Normalize if not zero
                const len = Math.sqrt(avoidX * avoidX + avoidZ * avoidZ);
                if (len > 0) {
                    avoidX /= len;
                    avoidZ /= len;
                } else {
                    // If directly on top of obstacle (unlikely), move in random direction
                    const randomAngle = Math.random() * Math.PI * 2;
                    avoidX = Math.cos(randomAngle);
                    avoidZ = Math.sin(randomAngle);
                }
                
                // Avoidance force increases as we get closer to obstacle
                const avoidMultiplier = 1.0 - (distance / minDistance);
                avoidanceForce.x += avoidX * avoidMultiplier * 0.05;
                avoidanceForce.z += avoidZ * avoidMultiplier * 0.05;
            }
        });
        
        // Apply avoidance force
        if (avoidanceForce.length() > 0) {
            this.applyForce(avoidanceForce);
        }
        
        // Add this at the end of the method:
        // Extra check to ensure we're not inside any obstacle after applying avoidance forces
        for (const obstacle of obstacles) {
            // Get obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Calculate horizontal distance between enemy center and obstacle center
            const dx = this.mesh.position.x - obstacle.position.x;
            const dz = this.mesh.position.z - obstacle.position.z;
            const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
            
            // Calculate minimum distance needed to avoid collision
            const obstacleRadius = Math.max(size.x, size.z) * 0.5;
            const minDistance = obstacleRadius + params.enemySize;
            
            if (horizontalDistance < minDistance) {
                // We're inside or too close to an obstacle - move away immediately
                const awayDirection = new THREE.Vector3(dx, 0, dz).normalize();
                const pushDistance = (minDistance - horizontalDistance) + 0.2; // Add a small buffer
                
                // Apply immediate position correction
                this.mesh.position.x += awayDirection.x * pushDistance;
                this.mesh.position.z += awayDirection.z * pushDistance;
                
                // Reverse velocity component in this direction
                const currentVelInAwayDir = this.velocity.dot(awayDirection);
                if (currentVelInAwayDir < 0) {
                    // Subtract the velocity component in the obstacle direction
                    this.velocity.x -= awayDirection.x * currentVelInAwayDir * 2;
                    this.velocity.z -= awayDirection.z * currentVelInAwayDir * 2;
                }
            }
        }
    }
}

// Add tactical popup class
class TacticalPopup {
    constructor(simulation) {
        this.simulation = simulation;
        this.currentEnemy = null;
        this.detectingDrone = null;
        this.isVisible = false;
        this.popupElement = null;
        
        // Create popup element
        this.createPopupElement();
        
        // Keep track if we've been initialized properly
        this.isInitialized = true;
    }
    
    createPopupElement() {
        // Check if popup already exists
        if (document.getElementById('tactical-popup')) {
            document.getElementById('tactical-popup').remove();
        }
        
        // Create popup container
        this.popupElement = document.createElement('div');
        this.popupElement.id = 'tactical-popup';
        this.popupElement.className = 'tactical-popup';
        this.popupElement.style.display = 'none';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'popup-header';
        header.textContent = 'ENEMY DETECTED';
        this.popupElement.appendChild(header);
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'popup-buttons';
        
        // Create neutralize button with proper reference to this
        const neutralizeBtn = document.createElement('button');
        neutralizeBtn.className = 'popup-btn neutralize-btn';
        neutralizeBtn.textContent = 'NEUTRALIZE TARGET';
        neutralizeBtn.addEventListener('click', () => {
            console.log('Neutralize button clicked');
            this.neutralizeTarget();
        });
        buttonsContainer.appendChild(neutralizeBtn);
        
        // Create evade button with proper reference to this
        const evadeBtn = document.createElement('button');
        evadeBtn.className = 'popup-btn evade-btn';
        evadeBtn.textContent = 'EVADE';
        evadeBtn.addEventListener('click', () => {
            console.log('Evade button clicked');
            this.evadeEnemy();
        });
        buttonsContainer.appendChild(evadeBtn);
        
        this.popupElement.appendChild(buttonsContainer);
        
        // Add to document
        document.body.appendChild(this.popupElement);
    }
    
    show(enemy, drone) {
        console.log('TacticalPopup.show called for enemy:', enemy.id, 'visible:', this.isVisible);
        
        if (this.isVisible) return;
        
        // If we don't have a popup element, recreate it
        if (!this.popupElement || !document.getElementById('tactical-popup')) {
            this.createPopupElement();
        }
        
        this.currentEnemy = enemy;
        this.detectingDrone = drone;
        this.isVisible = true;
        
        // Get screen position for the enemy
        const vector = new THREE.Vector3();
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;
        
        enemy.mesh.updateWorldMatrix(true, false);
        vector.setFromMatrixPosition(enemy.mesh.matrixWorld);
        vector.project(this.simulation.camera);
        
        const x = (vector.x * widthHalf) + widthHalf;
        const y = -(vector.y * heightHalf) + heightHalf;
        
        // Position popup to the right of the enemy position
        this.popupElement.style.left = `${Math.min(x + 100, window.innerWidth - 250)}px`;
        this.popupElement.style.top = `${Math.max(20, y - 50)}px`;
        this.popupElement.style.display = 'block';
        
        console.log('Tactical popup displayed at position:', x, y);
    }
    
    hide() {
        console.log('TacticalPopup.hide called');
        
        this.isVisible = false;
        this.currentEnemy = null;
        this.detectingDrone = null;
        
        if (this.popupElement) {
            this.popupElement.style.display = 'none';
        }
    }
    
    neutralizeTarget() {
        if (!this.currentEnemy || !this.detectingDrone) return;
        
        // Find nearest drone with a missile loaded
        let firingDrone = null;
        let closestDistance = Infinity;
        
        this.simulation.drones.forEach(drone => {
            if (drone.isAlive && drone.missileLoaded) {
                const distance = drone.mesh.position.distanceTo(this.currentEnemy.mesh.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    firingDrone = drone;
                }
            }
        });
        
        if (firingDrone) {
            // Fire missile at enemy
            this.fireMissile(firingDrone, this.currentEnemy);
            // Drone's missile has been used
            firingDrone.missileLoaded = false;
        }
        
        // Hide popup
        this.hide();
    }
    
    evadeEnemy() {
        if (!this.detectingDrone) return;
        
        // Calculate average position of other drones
        const otherDrones = this.simulation.drones.filter(d => 
            d.id !== this.detectingDrone.id && d.isAlive);
        
        if (otherDrones.length > 0) {
            // Calculate average position
            const avgPosition = new THREE.Vector3();
            otherDrones.forEach(drone => {
                avgPosition.add(drone.mesh.position);
            });
            avgPosition.divideScalar(otherDrones.length);
            
            // Set evade target position
            this.detectingDrone.evadeTarget = avgPosition;
            this.detectingDrone.isEvading = true;
            this.detectingDrone.evadeStartTime = performance.now();
            this.detectingDrone.preEvadeVelocity = this.detectingDrone.velocity.clone();
            
            // Boost speed temporarily
            this.detectingDrone.maxSpeed = params.droneSpeed * 3;
        }
        
        // Hide popup
        this.hide();
    }
    
    fireMissile(drone, enemy) {
        // Create a missile
        const missileGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
        const missileMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const missile = new THREE.Mesh(missileGeometry, missileMaterial);
        
        // Position missile at drone
        missile.position.copy(drone.mesh.position);
        
        // Add trail effect
        const trailGeometry = new THREE.BufferGeometry();
        const trailMaterial = new THREE.LineBasicMaterial({ 
            color: 0xFF8800, 
            transparent: true,
            opacity: 0.7
        });
        
        const trailPositions = [];
        for (let i = 0; i < 20; i++) {
            trailPositions.push(drone.mesh.position.x, drone.mesh.position.y, drone.mesh.position.z);
        }
        
        trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
        const trail = new THREE.Line(trailGeometry, trailMaterial);
        
        // Add to scene
        this.simulation.scene.add(missile);
        this.simulation.scene.add(trail);
        
        // Set up missile trajectory
        const startPos = drone.mesh.position.clone();
        const targetPos = enemy.mesh.position.clone();
        
        // Check if there is line of sight (for initial aiming)
        const hasLineOfSight = this.simulation.checkLineOfSight(startPos, targetPos);
        let hitObstacle = null;
        let hitPoint = null;
        let obstacleHitTime = 1.0; // Default value (full flight)
        
        // If no line of sight, find potential collision point
        if (!hasLineOfSight) {
            // Calculate the straight line path and check for collisions
            const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
            const distance = startPos.distanceTo(targetPos);
            const raycaster = new THREE.Raycaster(startPos, direction, 0.1, distance);
            const intersects = raycaster.intersectObjects(this.simulation.obstacles);
            
            if (intersects.length > 0) {
                // Calculate at what time in the journey the missile will hit the obstacle
                const intersection = intersects[0];
                hitObstacle = intersection.object;
                hitPoint = intersection.point;
                
                // Calculate what fraction of the journey this represents
                const hitDistance = startPos.distanceTo(hitPoint);
                obstacleHitTime = hitDistance / distance;
            }
        }
        
        // Create missile flight animation
        let progress = 0;
        let missileHit = false;
        
        const animateMissile = () => {
            // If missile already hit something, don't continue animation
            if (missileHit) return;
            
            progress += 0.02;
            
            // Check if we've hit an obstacle
            if (!hasLineOfSight && progress >= obstacleHitTime && hitObstacle) {
                // Missile has reached the obstacle collision point
                this.showMissileImpact(missile, trail, hitPoint, hitObstacle);
                missileHit = true;
                return;
            }
            
            // Check if we've reached the target
            if (progress >= 1.0) {
                // Missile has reached the target
                if (hasLineOfSight) {
                    // Only destroy enemy if there was line of sight at launch
                    this.showMissileImpact(missile, trail, targetPos, enemy);
                    enemy.destroyEnemy();
                    this.showNeutralizationMessage(enemy);
                } else {
                    // Just remove the missile
                    this.cleanupMissile(missile, trail);
                }
                missileHit = true;
                return;
            }
            
            // Update missile position - use a curved path with slight arc
            const arcHeight = 1 + Math.sin(progress * Math.PI) * 2;
            missile.position.lerpVectors(startPos, targetPos, progress);
            missile.position.y += arcHeight * (1 - progress); // Add arc that diminishes as we approach target
            
            // Point missile towards target
            missile.lookAt(targetPos);
            missile.rotateX(Math.PI / 2); // Adjust for cylinder orientation
            
            // Update trail
            const positions = trail.geometry.attributes.position.array;
            // Shift positions
            for (let i = positions.length - 3; i >= 3; i -= 3) {
                positions[i] = positions[i - 3];
                positions[i + 1] = positions[i - 2];
                positions[i + 2] = positions[i - 1];
            }
            
            // Add new position at the front
            positions[0] = missile.position.x;
            positions[1] = missile.position.y;
            positions[2] = missile.position.z;
            
            trail.geometry.attributes.position.needsUpdate = true;
            
            requestAnimationFrame(animateMissile);
        };
        
        // Start animation
        animateMissile();
    }
    
    // Helper to show missile impact effect
    showMissileImpact(missile, trail, position, target) {
        // Explosion effect
        const explosionGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFAA00,
            transparent: true,
            opacity: 0.8
        });
        
        const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
        explosion.position.copy(position);
        this.simulation.scene.add(explosion);
        
        // Animate explosion
        let scale = 1;
        const expandAndFade = () => {
            scale *= 1.1;
            explosion.scale.set(scale, scale, scale);
            explosion.material.opacity *= 0.9;
            
            if (explosion.material.opacity > 0.05) {
                requestAnimationFrame(expandAndFade);
            } else {
                // Remove explosion
                this.simulation.scene.remove(explosion);
                explosionGeometry.dispose();
                explosionMaterial.dispose();
            }
        };
        
        // Clean up missile and trail
        this.cleanupMissile(missile, trail);
        
        // Start explosion animation
        expandAndFade();
    }
    
    // Helper to clean up missile and trail
    cleanupMissile(missile, trail) {
        // Remove missile and trail
        this.simulation.scene.remove(missile);
        this.simulation.scene.remove(trail);
        
        // Cleanup geometries and materials
        if (missile.geometry) missile.geometry.dispose();
        if (missile.material) missile.material.dispose();
        if (trail.geometry) trail.geometry.dispose();
        if (trail.material) trail.material.dispose();
    }
    
    // Show a brief "ENEMY NEUTRALIZED" message
    showNeutralizationMessage(enemy) {
        // Check if a message already exists and remove it
        const existingMessage = document.getElementById('neutralization-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.id = 'neutralization-message';
        messageElement.className = 'neutralization-message';
        messageElement.textContent = 'ENEMY NEUTRALIZED';
        
        // Calculate position near the enemy
        const vector = new THREE.Vector3();
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;
        
        enemy.mesh.updateWorldMatrix(true, false);
        vector.setFromMatrixPosition(enemy.mesh.matrixWorld);
        vector.project(this.simulation.camera);
        
        const x = (vector.x * widthHalf) + widthHalf;
        const y = -(vector.y * heightHalf) + heightHalf;
        
        // Position message - override the CSS positioning to place it at the enemy
        messageElement.style.position = 'fixed';
        messageElement.style.bottom = 'auto'; // Override the CSS
        messageElement.style.left = `${x - 75}px`;
        messageElement.style.top = `${y - 40}px`;
        messageElement.style.transform = 'none'; // Override the CSS
        messageElement.style.backgroundColor = 'rgba(0, 150, 0, 0.8)';
        messageElement.style.padding = '10px 15px';
        messageElement.style.borderRadius = '5px';
        messageElement.style.fontWeight = 'bold';
        messageElement.style.fontSize = '16px';
        messageElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        messageElement.style.zIndex = '1000';
        messageElement.style.textAlign = 'center';
        
        // Add to document
        document.body.appendChild(messageElement);
        
        // Remove after 2 seconds
        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (messageElement.parentNode) {
                    messageElement.parentNode.removeChild(messageElement);
                }
            }, 500);
        }, 2000);
    }
}

class DroneSimulation {
    constructor() {
        this.setupScene();
        this.setupLights();
        this.setupControls();
        this.createGround();
        this.createBoundary();
        this.createObstacles();
        this.createEnemies();
        this.createDrones();
        this.addEventListeners();
        
        // Create tactical popup
        this.tacticalPopup = new TacticalPopup(this);
        
        // Keep track of time for enemy shooting
        this.clock = new THREE.Clock();
        this.clock.stop(); // Start with the clock stopped
        this.time = 0;
        this.lastFrameTime = 0;
        
        // Track simulation victory state
        this.victoryDisplayed = false;
        this.defeatDisplayed = false;
        this.ammoDepletedDisplayed = false;  // Track if ammo depleted message was shown
        
        // Swarm shared intelligence (global knowledge base)
        this.swarmKnowledge = new Map(); // Map of enemy IDs to last known positions
        
        // Initialize array to track active lasers
        this.activeLasers = [];
        
        // Start animation loop (even though simulation is not running yet)
        this.animate();
        
        // Set global reference to this simulation
        window.droneSimulation = this;
        
        // Display instruction overlay
        params.overlayRemoved = false; // Reset overlay state
        this.showStartInstructions();
        
        // Force cleanup of any recon checkbox if it exists
        setTimeout(() => {
            // Remove any recon mode checkbox that might still be in the DOM
            const reconCheckboxContainer = document.querySelector('label[for="recon-mode"]');
            if (reconCheckboxContainer && reconCheckboxContainer.parentNode) {
                console.log("Removing leftover recon mode checkbox");
                reconCheckboxContainer.parentNode.remove();
            }
            
            // Hide any existing recon mode checkbox
            const reconCheckbox = document.getElementById('recon-mode');
            if (reconCheckbox) {
                console.log("Hiding existing recon mode checkbox");
                reconCheckbox.style.display = 'none';
                if (reconCheckbox.parentNode) {
                    reconCheckbox.parentNode.style.display = 'none';
                }
            }
        }, 1000); // Delay to ensure DOM is fully loaded
    }
    
    // Show instructions overlay to prompt user to press START
    showStartInstructions() {
        // Remove any existing overlay first
        this.hideStartInstructions();
        
        // Create new overlay
        const overlay = document.createElement('div');
        overlay.id = 'start-overlay';
        overlay.innerHTML = `
            <div class="overlay-content">
                <h2>Military Drone Swarm Simulation</h2>
                <p>Adjust parameters using the control panel, then press START to begin.</p>
            </div>
        `;
        document.getElementById('simulation-container').appendChild(overlay);
        params.overlayRemoved = false;
        
        // Add a direct click handler to the overlay itself as a backup
        overlay.addEventListener('click', function() {
            if (params.isRunning) {
                window.droneSimulation.hideStartInstructions();
            }
        });
    }
    
    // Hide the instructions overlay
    hideStartInstructions() {
        // Check if already removed
        if (params.overlayRemoved) return;
        
        // Try various methods to ensure it's removed
        
        // Method 1: By ID
        const overlay = document.getElementById('start-overlay');
        if (overlay) {
            overlay.remove();
            params.overlayRemoved = true;
            console.log('Overlay removed by ID');
        }
        
        // Method 2: Query selector
        const overlayByQuery = document.querySelector('#start-overlay');
        if (overlayByQuery) {
            overlayByQuery.remove();
            params.overlayRemoved = true;
            console.log('Overlay removed by query selector');
        }
        
        // Method 3: Find in simulation container
        const simContainer = document.getElementById('simulation-container');
        if (simContainer) {
            const children = simContainer.children;
            for (let i = 0; i < children.length; i++) {
                if (children[i].id === 'start-overlay') {
                    simContainer.removeChild(children[i]);
                    params.overlayRemoved = true;
                    console.log('Overlay removed from simulation container');
                    break;
                }
            }
        }
    }
    
    // Start the simulation
    startSimulation() {
        // First, aggressively remove the overlay
        this.hideStartInstructions();
        
        if (!params.isRunning) {
            params.isRunning = true;
            params.isPaused = false;
            this.clock.start();
            
            // Ensure overlay is removed again
            this.hideStartInstructions();
            
            // Set a backup timeout to remove overlay
            setTimeout(() => {
                this.hideStartInstructions();
            }, 100);
            
            // Update button states
            document.getElementById('start-btn').disabled = true;
            document.getElementById('pause-btn').disabled = false;
            document.getElementById('pause-btn').textContent = 'PAUSE';
        } else if (params.isPaused) {
            // Resume from pause
            params.isPaused = false;
            this.clock.start();
            
            // Ensure overlay is removed here too
            this.hideStartInstructions();
            
            // Update button states
            document.getElementById('pause-btn').textContent = 'PAUSE';
        }
    }
    
    // Pause the simulation
    pauseSimulation() {
        if (params.isRunning && !params.isPaused) {
            params.isPaused = true;
            this.clock.stop();
            
            // Update button states
            document.getElementById('pause-btn').textContent = 'RESUME';
        }
    }
    
    // Reset the simulation
    resetSimulation() {
        // Stop the clock and reset simulation state
        this.clock.stop();
        params.isRunning = false;
        params.isPaused = false;
        this.time = 0;
        this.lastFrameTime = 0;
        
        // Update button states
        document.getElementById('start-btn').disabled = false;
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('pause-btn').textContent = 'PAUSE';
        
        // Show start instructions again
        params.overlayRemoved = false;
        this.showStartInstructions();
        
        // Clean up any active lasers
        if (this.activeLasers && this.activeLasers.length > 0) {
            // Create a copy of the array to avoid modification during iteration
            const lasers = [...this.activeLasers];
            lasers.forEach(laser => {
                if (laser.parent) {
                    laser.parent.remove(laser);
                    if (laser.geometry) laser.geometry.dispose();
                    if (laser.material) laser.material.dispose();
                }
            });
            this.activeLasers = [];
        }
        
        // Remove existing entities
        this.drones.forEach(drone => {
            this.droneGroup.remove(drone.mesh);
        });
        this.drones = [];
        
        this.enemies.forEach(enemy => {
            this.enemyGroup.remove(enemy.mesh);
        });
        this.enemies = [];
        
        this.obstacles.forEach(obstacle => {
            this.obstacleGroup.remove(obstacle);
        });
        this.obstacles = [];
        
        // Update ground and boundary for new map size
        this.updateGround();
        this.updateBoundary();
        
        // Reset tactical popup and swarm knowledge
        if (this.tacticalPopup) {
            this.tacticalPopup.hide();
            // Recreate the tactical popup to ensure event listeners are fresh
            this.tacticalPopup = new TacticalPopup(this);
        }
        
        // Clear swarm knowledge
        this.swarmKnowledge.clear();
        this.victoryDisplayed = false;
        this.defeatDisplayed = false;
        
        // Recreate entities
        this.createObstacles();
        this.createEnemies();
        this.createDrones();
    }
    
    setupScene() {
        // Create scene, camera and renderer
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.FogExp2(0x000000, 0.01);
        
        this.camera = new THREE.PerspectiveCamera(
            60, window.innerWidth / window.innerHeight, 0.1, 1000
        );
        this.camera.position.set(
            params.cameraPosition.x, 
            params.cameraPosition.y, 
            params.cameraPosition.z
        );
        this.camera.lookAt(0, 0, 0);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('simulation-container').appendChild(this.renderer.domElement);
        
        // Add orbit controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
    }
    
    setupLights() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, params.ambientLightIntensity);
        this.scene.add(ambientLight);
        
        // Add directional light (sun)
        const directionalLight = new THREE.DirectionalLight(
            0xffffff, params.directionalLightIntensity
        );
        directionalLight.position.set(10, 20, 15);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        this.scene.add(directionalLight);
    }
    
    setupControls() {
        // Setup UI controls
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startSimulation();
        });
        
        document.getElementById('pause-btn').addEventListener('click', () => {
            if (params.isPaused) {
                this.startSimulation(); // Resume
            } else {
                this.pauseSimulation();
            }
        });
        
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetSimulation();
        });
        
        document.getElementById('map-size').addEventListener('input', (e) => {
            params.mapSize = parseInt(e.target.value);
            params.groundSize = params.mapSize * 1.5; // Update ground size based on map size
            document.getElementById('map-size-value').textContent = params.mapSize;
            this.resetSimulation();
        });
        
        document.getElementById('drone-count').addEventListener('input', (e) => {
            params.droneCount = parseInt(e.target.value);
            document.getElementById('drone-count-value').textContent = params.droneCount;
            this.resetSimulation();
        });
        
        document.getElementById('enemy-count').addEventListener('input', (e) => {
            params.enemyCount = parseInt(e.target.value);
            document.getElementById('enemy-count-value').textContent = params.enemyCount;
            this.resetSimulation();
        });
        
        document.getElementById('drone-altitude').addEventListener('input', (e) => {
            params.droneMinAltitude = parseFloat(e.target.value);
            document.getElementById('drone-altitude-value').textContent = params.droneMinAltitude;
        });
        
        document.getElementById('detection-range').addEventListener('input', (e) => {
            params.detectionRange = parseFloat(e.target.value);
            document.getElementById('detection-range-value').textContent = params.detectionRange;
            // Update detection bubble sizes
            this.drones.forEach(drone => {
                drone.detectionBubble.scale.set(
                    params.detectionRange / 5, 
                    params.detectionRange / 5, 
                    params.detectionRange / 5
                );
            });
        });
        
        document.getElementById('cohesion-weight').addEventListener('input', (e) => {
            params.cohesionWeight = parseFloat(e.target.value);
            document.getElementById('cohesion-value').textContent = params.cohesionWeight.toFixed(1);
        });
        
        document.getElementById('separation-weight').addEventListener('input', (e) => {
            params.separationWeight = parseFloat(e.target.value);
            document.getElementById('separation-value').textContent = params.separationWeight.toFixed(1);
        });
        
        document.getElementById('avoidance-weight').addEventListener('input', (e) => {
            params.avoidanceWeight = parseFloat(e.target.value);
            document.getElementById('avoidance-value').textContent = params.avoidanceWeight.toFixed(1);
        });
        
        document.getElementById('collision-damage').addEventListener('input', (e) => {
            params.collisionDamage = parseInt(e.target.value);
            document.getElementById('collision-damage-value').textContent = params.collisionDamage;
        });
        
        document.getElementById('enemy-shooting').addEventListener('change', (e) => {
            params.enemyShootingEnabled = e.target.checked;
        });
        
        // Add a new slider for search aggressiveness
        document.getElementById('search-aggressiveness').addEventListener('input', (e) => {
            params.searchAggressiveness = parseFloat(e.target.value);
            document.getElementById('search-aggressiveness-value').textContent = params.searchAggressiveness.toFixed(1);
        });
        
        // Removed recon-mode event listener as recon mode is now always enabled
    }
    
    createGround() {
        // Create a ground plane
        const size = params.groundSize;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshStandardMaterial({
            color: 0x556633,
            roughness: 0.8,
            metalness: 0.1
        });
        
        this.ground = new THREE.Mesh(geometry, material);
        this.ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.ground.position.y = 0;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
        
        // Add a grid helper
        this.gridHelper = new THREE.GridHelper(size, 20, 0x444444, 0x222222);
        this.gridHelper.position.y = 0.01; // Position slightly above ground to avoid z-fighting
        this.scene.add(this.gridHelper);
    }
    
    updateGround() {
        // Remove existing ground and grid
        this.scene.remove(this.ground);
        this.scene.remove(this.gridHelper);
        
        // Recreate with new size
        this.createGround();
    }
    
    createBoundary() {
        // Create a wireframe box to show boundaries
        const size = params.mapSize;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0x666666,
            wireframe: true,
            transparent: true,
            opacity: 0.2
        });
        this.boundary = new THREE.Mesh(geometry, material);
        this.boundary.position.y = size / 2; // Center vertically with ground at y=0
        this.scene.add(this.boundary);
    }
    
    createObstacles() {
        this.obstacles = [];
        
        // Create obstacle group to hold all obstacles
        this.obstacleGroup = new THREE.Group();
        this.scene.add(this.obstacleGroup);
        
        // Create fixed obstacles (gray blocks on the ground)
        for (let i = 0; i < params.obstacleCount; i++) {
            const width = Math.random() * 
                (params.maxObstacleSize - params.minObstacleSize) + 
                params.minObstacleSize;
            
            const height = Math.random() * 
                (params.maxObstacleSize - params.minObstacleSize) + 
                params.minObstacleSize;
                
            const depth = Math.random() * 
                (params.maxObstacleSize - params.minObstacleSize) + 
                params.minObstacleSize;
                
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0x888888,
                roughness: 0.7,
                metalness: 0.2
            });
            const obstacle = new THREE.Mesh(geometry, material);
            
            // Set random position on the ground
            const bound = params.mapSize / 2 - Math.max(width, depth) / 2;
            obstacle.position.set(
                (Math.random() - 0.5) * bound * 1.8,
                height / 2, // Place on the ground (bottom of box at y=0)
                (Math.random() - 0.5) * bound * 1.8
            );
            
            obstacle.castShadow = true;
            obstacle.receiveShadow = true;
            
            this.obstacles.push(obstacle);
            this.obstacleGroup.add(obstacle);
        }
    }
    
    createEnemies() {
        this.enemies = [];
        
        // Create enemy group
        this.enemyGroup = new THREE.Group();
        this.scene.add(this.enemyGroup);
        
        // Create enemies
        for (let i = 0; i < params.enemyCount; i++) {
            // Position enemies on the ground
            const bound = params.mapSize / 2 - 1;
            let position;
            let isValidPosition = false;
            
            // Try to find a valid position that's not inside any obstacle
            let attempts = 0;
            const maxAttempts = 50; // Limit attempts to prevent infinite loops
            
            while (!isValidPosition && attempts < maxAttempts) {
                position = new THREE.Vector3(
                    (Math.random() - 0.5) * bound * 1.8,
                    0.3, // Slightly above ground to avoid z-fighting
                    (Math.random() - 0.5) * bound * 1.8
                );
                
                // Check if position is clear of obstacles
                if (this.obstacles && this.obstacles.length > 0) {
                    isValidPosition = this.validateSpawnPosition(position, this.obstacles);
                } else {
                    isValidPosition = true; // No obstacles to check against
                }
                
                attempts++;
            }
            
            // If we couldn't find a valid position after max attempts, use the last position
            // but log a warning (this should rarely happen with reasonable obstacle density)
            if (!isValidPosition) {
                console.warn(`Could not find valid position for enemy ${i} after ${maxAttempts} attempts`);
            }
            
            const enemy = new Enemy(i, position);
            this.enemies.push(enemy);
            this.enemyGroup.add(enemy.mesh);
        }
    }
    
    createDrones() {
        this.drones = [];
        
        // Create drone group
        this.droneGroup = new THREE.Group();
        this.scene.add(this.droneGroup);
        
        // Create drones
        for (let i = 0; i < params.droneCount; i++) {
            // Set random initial position (above minimum altitude)
            const bound = params.mapSize / 2;
            let position;
            let isValidPosition = false;
            
            // Try to find a valid position that's not inside any obstacle
            let attempts = 0;
            const maxAttempts = 50; // Limit attempts to prevent infinite loops
            
            while (!isValidPosition && attempts < maxAttempts) {
                position = new THREE.Vector3(
                    (Math.random() - 0.5) * bound,
                    params.droneMinAltitude + Math.random() * 5,
                    (Math.random() - 0.5) * bound
                );
                
                // Check if position is clear of obstacles
                if (this.obstacles && this.obstacles.length > 0) {
                    // For drones, we need to consider vertical position as well
                    isValidPosition = this.validateSpawnPosition(position, this.obstacles, true);
                } else {
                    isValidPosition = true; // No obstacles to check against
                }
                
                attempts++;
            }
            
            // If we couldn't find a valid position after max attempts, use the last position
            // but adjust altitude to be higher than obstacles
            if (!isValidPosition) {
                console.warn(`Could not find valid position for drone ${i} after ${maxAttempts} attempts`);
                position.y = Math.max(position.y, 5); // Set higher than typical obstacles
            }
            
            const drone = new Drone(i, position);
            this.drones.push(drone);
            this.droneGroup.add(drone.mesh);
        }
    }
    
    // Helper method to validate spawn positions
    validateSpawnPosition(position, obstacles, isDrone = false) {
        // Entity dimensions for collision detection
        const entityRadius = isDrone ? params.droneSize * 1.5 : Math.max(params.enemySize * 1.5, params.enemySize * 2) * 0.5;
        
        for (const obstacle of obstacles) {
            // Get obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Calculate horizontal distance between entity center and obstacle center
            const dx = position.x - obstacle.position.x;
            const dz = position.z - obstacle.position.z;
            const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
            
            // Calculate obstacle dimensions
            const obstacleRadius = Math.max(size.x, size.z) * 0.5;
            const obstacleHeight = size.y;
            const minDistance = obstacleRadius + entityRadius;
            
            // Check horizontal collision
            if (horizontalDistance < minDistance) {
                // For drones, check if we're above the obstacle
                if (isDrone) {
                    const obstacleTop = obstacle.position.y + obstacleHeight / 2;
                    if (position.y < obstacleTop + entityRadius) {
                        return false; // Drone is inside or too close to the obstacle
                    }
                } else {
                    return false; // Entity is too close to an obstacle
                }
            }
        }
        
        return true; // Position is clear
    }
    
    updateDrones() {
        // Skip updates if simulation isn't running or is paused
        if (!params.isRunning || params.isPaused) return;
        
        // First, detect enemies for all drones and update swarm knowledge
        let enemyDetected = false;
        
        this.drones.forEach(drone => {
            const detectedEnemies = drone.detectEnemies(this.enemies, this.drones);
            
            // Update global swarm knowledge when enemies are detected
            detectedEnemies.forEach(enemy => {
                if (!enemy.isDestroyed) {
                    // Add to swarm knowledge base with current timestamp
                    this.swarmKnowledge.set(enemy.id, {
                        position: enemy.mesh.position.clone(),
                        timestamp: performance.now(),
                        detectedBy: drone.id
                    });
                    
                    // Show communication visualization for all drones (optional)
                    this.visualizeSwarmCommunication(drone);
                }
            });
            
            // If an enemy is detected and popup is not showing, display it
            if (detectedEnemies.length > 0 && !this.tacticalPopup.isVisible && params.isRunning && !params.isPaused) {
                // Show popup for the first alive and non-destroyed enemy
                const aliveEnemy = detectedEnemies.find(e => !e.isDestroyed);
                if (aliveEnemy) {
                    // Ensure the popup is properly initialized
                    if (!this.tacticalPopup || !this.tacticalPopup.popupElement) {
                        this.tacticalPopup = new TacticalPopup(this);
                    }
                    
                    // Show the tactical popup
                    this.tacticalPopup.show(aliveEnemy, drone);
                    enemyDetected = true;
                    
                    console.log('Tactical popup triggered for enemy:', aliveEnemy.id);
                }
            }
            
            // Handle evade behavior
            if (drone.isEvading) {
                const evadeDuration = 3000; // 3 seconds of evasion
                const elapsedTime = performance.now() - drone.evadeStartTime;
                
                if (elapsedTime > evadeDuration) {
                    // End evasion
                    drone.isEvading = false;
                    drone.maxSpeed = params.droneSpeed;
                } else {
                    // Move towards evade target at boosted speed
                    const direction = new THREE.Vector3().subVectors(
                        drone.evadeTarget, drone.mesh.position).normalize();
                    
                    // Apply strong force in that direction
                    drone.applyForce(direction.multiplyScalar(0.1));
                }
            }
        });
        
        // Share swarm knowledge with all drones
        this.shareSwarmKnowledge();
        
        // Then update each drone
        this.drones.forEach(drone => {
            // Skip destroyed drones for behavior, but still update physics
            if (drone.isAlive) {
                // Apply swarm behaviors
                this.applyAttraction(drone);
                this.applySeparation(drone);
                this.applyObstacleAvoidance(drone);
                
                // Keep within boundaries
                drone.enforceBoundaries();
            }
            
            // Update position and rotation
            drone.update();
        });
    }
    
    updateEnemies() {
        // Skip updates if simulation isn't running or is paused
        if (!params.isRunning || params.isPaused) return;
        
        // Update each enemy
        this.enemies.forEach(enemy => {
            enemy.update(this.time, this.drones, this.obstacles, this.swarmKnowledge);
        });
    }
    
    applyAttraction(drone) {
        const attractionForce = new THREE.Vector3();
        let hasTarget = false;
        
        // First, check knowledge base for known enemy positions
        if (drone.knownEnemies.size > 0) {
            // Find the closest known enemy
            let closestDistance = Infinity;
            let closestPosition = null;
            
            for (const info of drone.knownEnemies.values()) {
                const distance = drone.mesh.position.distanceTo(info.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPosition = info.position;
                }
            }
            
            if (closestPosition) {
                // Check if there's a clear path to the enemy without obstacles
                const hasDirectPath = this.checkDirectPath(drone.mesh.position, closestPosition);
                
                // Head towards the closest known enemy
                const force = new THREE.Vector3().subVectors(
                    closestPosition, 
                    drone.mesh.position
                );
                
                // Scale force based on distance (stronger when farther)
                // Reduce attraction force if there's an obstacle in the way
                const attractionMultiplier = hasDirectPath ? 1.0 : 0.3;
                force.normalize().multiplyScalar(params.cohesionWeight * 0.01 * attractionMultiplier);
                attractionForce.add(force);
                hasTarget = true;
                
                // Store this info on the drone for obstacle avoidance to use
                drone.currentTarget = closestPosition;
                drone.hasDirectPathToTarget = hasDirectPath;
            }
        }
        
        // If no known enemies, apply search pattern
        if (!hasTarget) {
            const searchDir = drone.getSearchDirection();
            searchDir.multiplyScalar(params.searchWeight * 0.01);
            attractionForce.add(searchDir);
            
            // Clear target info since we're just searching
            drone.currentTarget = null;
            drone.hasDirectPathToTarget = false;
        }
        
        // Apply the attraction force to the drone
        drone.applyForce(attractionForce);
    }
    
    // Helper method to check if there's a direct path without obstacles
    checkDirectPath(startPos, endPos) {
        // Direction vector from start to end
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        
        // Distance to check
        const distance = startPos.distanceTo(endPos);
        
        // Create a raycaster
        const raycaster = new THREE.Raycaster(startPos, direction, 0.1, distance);
        
        // Check for intersections with obstacles
        const intersects = raycaster.intersectObjects(this.obstacles);
        
        // Return true if no obstacles are in the way
        return intersects.length === 0;
    }
    
    applySeparation(drone) {
        // Separation: avoid other drones
        const separationForce = new THREE.Vector3();
        let neighborCount = 0;
        
        // Scale separation distance based on the separation weight parameter
        // Higher separation values create more distance between drones
        const separationDistance = params.droneSize * 10 * (1 + params.separationWeight / 2);
        
        // Check all other drones
        this.drones.forEach(otherDrone => {
            if (otherDrone.id !== drone.id && otherDrone.isAlive) {
                const distance = drone.mesh.position.distanceTo(otherDrone.mesh.position);
                
                // If drones are too close
                if (distance < separationDistance) {
                    // Calculate repulsion vector (pointing away from neighbor)
                    const repulsion = new THREE.Vector3().subVectors(
                        drone.mesh.position,
                        otherDrone.mesh.position
                    );
                    
                    // Scale repulsion inversely to distance and proportionally to separation weight
                    const repulsionStrength = (1.0 / Math.max(0.1, distance)) * params.separationWeight;
                    repulsion.normalize().multiplyScalar(repulsionStrength);
                    separationForce.add(repulsion);
                    neighborCount++;
                }
            }
        });
        
        // Apply the separation force if there are neighbors
        if (neighborCount > 0) {
            // No need to average if we're using the separation weight directly
            drone.applyForce(separationForce);
        }
    }
    
    applyObstacleAvoidance(drone) {
        // Obstacle avoidance
        const avoidanceForce = new THREE.Vector3();
        const avoidanceDistance = 3.0; // How far to avoid obstacles
        let collisionDetected = false;
        
        // Increase avoidance weight when pursuing a target through obstacles
        let effectiveAvoidanceWeight = params.avoidanceWeight;
        if (drone.currentTarget && !drone.hasDirectPathToTarget) {
            // Boost obstacle avoidance when we need to navigate around obstacles to reach a target
            effectiveAvoidanceWeight = Math.max(params.avoidanceWeight * 2.5, 2.0);
        }
        
        this.obstacles.forEach(obstacle => {
            if (!drone.isAlive) return;
            
            // Calculate horizontal distance to obstacle (x-z plane)
            const obstaclePos = obstacle.position.clone();
            const dronePos = drone.mesh.position.clone();
            
            // Get obstacle dimensions
            const size = new THREE.Vector3();
            obstacle.geometry.computeBoundingBox();
            obstacle.geometry.boundingBox.getSize(size);
            
            // Calculate more precise 3D distance for collision detection
            const droneRadius = params.droneSize;
            
            // Check if drone is inside the obstacle's bounding box (plus drone radius)
            const isColliding = (
                dronePos.x > obstaclePos.x - size.x/2 - droneRadius && 
                dronePos.x < obstaclePos.x + size.x/2 + droneRadius &&
                dronePos.y > obstaclePos.y - size.y/2 - droneRadius && 
                dronePos.y < obstaclePos.y + size.y/2 + droneRadius &&
                dronePos.z > obstaclePos.z - size.z/2 - droneRadius && 
                dronePos.z < obstaclePos.z + size.z/2 + droneRadius
            );
            
            // Handle collision
            if (isColliding) {
                // Calculate collision speed (magnitude of velocity)
                const collisionSpeed = drone.velocity.length();
                
                // Have the drone respond to the collision
                drone.collideWithObstacle(obstacle, collisionSpeed);
                collisionDetected = true;
                
                // Calculate closest point on obstacle surface to push drone away
                const closestPoint = new THREE.Vector3(
                    Math.max(obstaclePos.x - size.x/2, Math.min(dronePos.x, obstaclePos.x + size.x/2)),
                    Math.max(obstaclePos.y - size.y/2, Math.min(dronePos.y, obstaclePos.y + size.y/2)),
                    Math.max(obstaclePos.z - size.z/2, Math.min(dronePos.z, obstaclePos.z + size.z/2))
                );
                
                // Push drone away from collision point with a strong force
                const pushForce = new THREE.Vector3().subVectors(dronePos, closestPoint);
                pushForce.normalize().multiplyScalar(0.1); // Strong push
                drone.applyForce(pushForce);
            }
            
            // Only consider x,z distance for regular avoidance behavior (when not already colliding)
            if (!collisionDetected) {
                const xzDistance = Math.sqrt(
                    Math.pow(dronePos.x - obstaclePos.x, 2) +
                    Math.pow(dronePos.z - obstaclePos.z, 2)
                );
                
                const effectiveRadius = Math.max(size.x, size.z) / 2;
                
                // If drone is close to obstacle horizontally
                if (xzDistance < effectiveRadius + avoidanceDistance) {
                    // Calculate avoidance vector (pointing away from obstacle, but only in x,z plane)
                    const avoidance = new THREE.Vector3(
                        dronePos.x - obstaclePos.x,
                        0, // No vertical component
                        dronePos.z - obstaclePos.z
                    );
                    
                    // Scale avoidance inversely to distance
                    avoidance.normalize().multiplyScalar(1.0 / Math.max(0.1, xzDistance - effectiveRadius));
                    avoidanceForce.add(avoidance);
                    
                    // Add upward force to fly over obstacles
                    if (dronePos.y < obstacle.position.y + size.y + 1) {
                        avoidanceForce.y += 0.05;
                    }
                }
            }
        });
        
        // Apply the avoidance force (if not colliding)
        if (!collisionDetected && avoidanceForce.length() > 0) {
            avoidanceForce.normalize().multiplyScalar(effectiveAvoidanceWeight * 0.02);
            drone.applyForce(avoidanceForce);
        }
    }
    
    updateBoundary() {
        // Update boundary box size
        this.scene.remove(this.boundary);
        const size = params.mapSize;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0x666666,
            wireframe: true,
            transparent: true,
            opacity: 0.2
        });
        this.boundary = new THREE.Mesh(geometry, material);
        this.boundary.position.y = size / 2; // Center vertically with ground at y=0
        this.scene.add(this.boundary);
    }
    
    addEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // If simulation is running but overlay is still visible, force remove it
        if (params.isRunning && !params.overlayRemoved) {
            this.hideStartInstructions();
        }
        
        // Update time if simulation is running and not paused
        if (params.isRunning && !params.isPaused) {
            this.time = this.clock.getElapsedTime() * 1000; // Convert to milliseconds
            
            // Check if all enemies have been neutralized
            if (this.checkAllEnemiesNeutralized()) {
                this.showVictoryMessage();
            }
            
            // Check if all drones have been destroyed
            if (this.checkAllDronesDestroyed()) {
                this.showDefeatMessage();
            }
            
            // Check ammo status
            this.checkAmmoStatus();
        }
        
        this.updateDrones();
        this.updateEnemies();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    // Check if all enemies have been neutralized
    checkAllEnemiesNeutralized() {
        // Skip check if simulation isn't running or is paused
        if (!params.isRunning || params.isPaused || this.victoryDisplayed) return false;
        
        // Check if we have enemies
        if (this.enemies.length === 0) return false;
        
        // Check if all enemies are destroyed
        return this.enemies.every(enemy => enemy.isDestroyed);
    }
    
    // Show victory message when all enemies are neutralized
    showVictoryMessage() {
        // Prevent multiple victory messages
        this.victoryDisplayed = true;
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.id = 'victory-message';
        messageElement.className = 'victory-message';
        messageElement.textContent = 'ALL ENEMIES NEUTRALIZED';
        
        // Add to document
        document.body.appendChild(messageElement);
        
        // Animate message (fade in, then fade out)
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'scale(0.8)';
        
        // Fade in
        setTimeout(() => {
            messageElement.style.opacity = '1';
            messageElement.style.transform = 'scale(1)';
        }, 10);
        
        // Fade out and remove after 3 seconds
        setTimeout(() => {
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'scale(1.2)';
            
            // Reset the simulation after message fades
            setTimeout(() => {
                if (messageElement.parentNode) {
                    messageElement.parentNode.removeChild(messageElement);
                }
                this.resetSimulation();
            }, 1000);
        }, 3000);
    }
    
    // New method to share global swarm knowledge with all drones
    shareSwarmKnowledge() {
        if (this.swarmKnowledge.size === 0) return;
        
        // First, filter out any knowledge about destroyed enemies
        this.enemies.forEach(enemy => {
            if (enemy.isDestroyed && this.swarmKnowledge.has(enemy.id)) {
                this.swarmKnowledge.delete(enemy.id);
            }
        });
        
        this.drones.forEach(drone => {
            if (drone.isAlive) {
                // Clear old knowledge first to ensure updated positions
                drone.knownEnemies.clear();
                
                // Copy swarm knowledge to this drone
                for (const [enemyId, info] of this.swarmKnowledge.entries()) {
                    // Extra check to ensure we're not tracking destroyed enemies
                    const enemy = this.enemies.find(e => e.id === enemyId);
                    if (enemy && !enemy.isDestroyed) {
                        drone.knownEnemies.set(enemyId, {
                            position: info.position.clone(),
                            timestamp: info.timestamp
                        });
                    }
                }
            }
        });
        
        // Clean up old knowledge (remove entries older than 10 seconds)
        const currentTime = performance.now();
        for (const [enemyId, info] of this.swarmKnowledge.entries()) {
            if (currentTime - info.timestamp > 10000) {
                this.swarmKnowledge.delete(enemyId);
            }
        }
    }
    
    // Visualize swarm communication (optional - adds visual effect)
    visualizeSwarmCommunication(detectingDrone) {
        // Flash communication bubble on the detecting drone
        detectingDrone.flashCommunication();
        
        // Flash communication on other drones with a delay based on distance
        this.drones.forEach(drone => {
            if (drone.id !== detectingDrone.id && drone.isAlive) {
                // Calculate delay based on distance (simulates communication wave)
                const distance = drone.mesh.position.distanceTo(detectingDrone.mesh.position);
                const delay = Math.min(distance * 20, 500); // Max 500ms delay
                
                setTimeout(() => {
                    drone.flashCommunication();
                }, delay);
            }
        });
    }
    
    // Check if all drones have been destroyed
    checkAllDronesDestroyed() {
        // Skip check if simulation isn't running or is paused
        if (!params.isRunning || params.isPaused || this.defeatDisplayed) return false;
        
        // Check if we have drones
        if (this.drones.length === 0) return false;
        
        // Check if all drones are destroyed
        return this.drones.every(drone => !drone.isAlive);
    }
    
    // Show defeat message when all drones are destroyed
    showDefeatMessage() {
        // Prevent multiple defeat messages
        this.defeatDisplayed = true;
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.id = 'defeat-message';
        messageElement.className = 'defeat-message';
        messageElement.textContent = 'ALL DRONES NEUTRALIZED';
        
        // Add to document
        document.body.appendChild(messageElement);
        
        // Clean up any active lasers
        if (this.activeLasers && this.activeLasers.length > 0) {
            // Create a copy of the array to avoid modification during iteration
            const lasers = [...this.activeLasers];
            lasers.forEach(laser => {
                if (laser.parent) {
                    laser.parent.remove(laser);
                    if (laser.geometry) laser.geometry.dispose();
                    if (laser.material) laser.material.dispose();
                }
            });
            this.activeLasers = [];
        }
        
        // Pause simulation
        params.isPaused = true;
        
        // Animate message and reset simulation after delay
        setTimeout(() => {
            // Fade out message
            if (messageElement.parentNode) {
                messageElement.style.opacity = 0;
            }
            
            // Remove message and reset simulation after fade
            setTimeout(() => {
                if (messageElement.parentNode) {
                    messageElement.parentNode.removeChild(messageElement);
                }
                // Reset to parameter screen
                this.resetSimulation();
                // Show the start instructions again
                this.showStartInstructions();
                // Reset defeat flag
                this.defeatDisplayed = false;
            }, 500);
        }, 2000);
    }
    
    // Check if there's a clear line of sight between two points
    checkLineOfSight(startPoint, endPoint) {
        // Direction vector from start to end
        const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
        
        // Distance between the points
        const distance = startPoint.distanceTo(endPoint);
        
        // Create a raycaster
        const raycaster = new THREE.Raycaster(startPoint, direction, 0.1, distance);
        
        // Check intersections with obstacles
        const intersects = raycaster.intersectObjects(this.obstacles);
        
        // Return true if no obstacles are in the way, false otherwise
        return intersects.length === 0;
    }
    
    // Add this visualization method to help debug line of sight
    visualizeLineOfSight(startPoint, endPoint, hasLineOfSight) {
        // Create a line to visualize the ray
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: hasLineOfSight ? 0x00FF00 : 0xFF0000, // Green if clear, red if blocked
            transparent: true,
            opacity: 0.5
        });
        
        const line = new THREE.Line(lineGeometry, lineMaterial);
        this.scene.add(line);
        
        // Remove after a short time
        setTimeout(() => {
            if (this.scene.children.includes(line)) {
                this.scene.remove(line);
                lineGeometry.dispose();
                lineMaterial.dispose();
            }
        }, 500);
    }
    
    // Check if all drones are out of ammo and display notification
    checkAmmoStatus() {
        // Check if all live drones are out of ammo
        const allOutOfAmmo = this.drones.filter(drone => drone.isAlive)
            .every(drone => !drone.missileLoaded);
        
        // If all drones are out of ammo and notification hasn't been shown yet
        if (allOutOfAmmo && !this.ammoDepletedDisplayed) {
            this.showAmmoDepletedMessage();
            this.ammoDepletedDisplayed = true;
        }
    }
    
    // Display "AMMO DEPLETED" message
    showAmmoDepletedMessage() {
        // Create message overlay
        const overlay = document.createElement('div');
        overlay.className = 'message-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '50%';
        overlay.style.left = '50%';
        overlay.style.transform = 'translate(-50%, -50%)';
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        overlay.style.color = 'white';
        overlay.style.padding = '20px 40px';
        overlay.style.borderRadius = '10px';
        overlay.style.fontSize = '36px';
        overlay.style.fontWeight = 'bold';
        overlay.style.zIndex = '1000';
        overlay.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        overlay.style.animation = 'pulse 2s infinite';
        overlay.style.textAlign = 'center';
        overlay.innerHTML = 'AMMO DEPLETED';
        
        // Add pulsing animation style
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(1.1); }
                100% { transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(style);
        
        // Add to document
        document.body.appendChild(overlay);
        
        // Remove after 3 seconds
        setTimeout(() => {
            overlay.style.animation = 'fadeOut 1s forwards';
            style.textContent += `
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            `;
            
            setTimeout(() => {
                overlay.remove();
            }, 1000);
        }, 3000);
    }
}

// Wait for DOM to load before starting simulation
window.addEventListener('DOMContentLoaded', () => {
    // Create simulation (but it won't run until START is pressed)
    const simulation = new DroneSimulation();
    
    // Add a redundant event listener directly to START button
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', function() {
            if (window.droneSimulation) {
                window.droneSimulation.hideStartInstructions();
            }
        });
    }
});

// Add CSS for start overlay
const style = document.createElement('style');
style.textContent = `
    #start-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10;
        transition: opacity 0.5s;
    }
    
    #start-overlay.fade-out {
        opacity: 0;
    }
    
    .overlay-content {
        background-color: rgba(40, 60, 80, 0.9);
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        color: white;
        max-width: 500px;
    }
    
    .overlay-content h2 {
        margin-top: 0;
        color: #5bf;
    }
    
    /* Tactical Popup Styling */
    .tactical-popup {
        position: absolute;
        width: 220px;
        background-color: rgba(40, 40, 40, 0.9);
        border: 2px solid #FF5533;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(255, 50, 0, 0.5);
        z-index: 100;
        overflow: hidden;
        font-family: 'Arial', sans-serif;
    }
    
    .popup-header {
        background-color: #FF5533;
        color: white;
        padding: 8px;
        text-align: center;
        font-weight: bold;
        font-size: 14px;
    }
    
    .popup-buttons {
        display: flex;
        flex-direction: column;
        padding: 10px;
    }
    
    .popup-btn {
        padding: 10px;
        margin: 5px 0;
        border: none;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
        transition: background-color 0.3s;
    }
    
    .neutralize-btn {
        background-color: #FF3322;
        color: white;
    }
    
    .neutralize-btn:hover {
        background-color: #FF5544;
    }
    
    .evade-btn {
        background-color: #3355FF;
        color: white;
    }
    
    .evade-btn:hover {
        background-color: #5577FF;
    }
    
    /* Neutralization Message Styling */
    .neutralization-message {
        position: absolute;
        padding: 10px 15px;
        background-color: rgba(0, 150, 0, 0.85);
        color: white;
        border-radius: 4px;
        font-weight: bold;
        text-align: center;
        box-shadow: 0 0 10px rgba(0, 200, 0, 0.6);
        z-index: 110;
        font-family: 'Arial', sans-serif;
        pointer-events: none;
        transition: opacity 0.5s, transform 0.3s;
        min-width: 150px;
    }
    
    /* Victory Message Styling */
    .victory-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px 30px;
        background-color: rgba(0, 100, 200, 0.9);
        color: white;
        border-radius: 10px;
        font-weight: bold;
        font-size: 24px;
        text-align: center;
        box-shadow: 0 0 30px rgba(0, 150, 255, 0.8);
        z-index: 120;
        font-family: 'Arial', sans-serif;
        pointer-events: none;
        transition: opacity 1s, transform 0.5s;
        min-width: 300px;
        border: 3px solid rgba(100, 200, 255, 0.8);
    }
`;
document.head.appendChild(style); 