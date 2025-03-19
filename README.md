# Military Drone Swarm Simulation

A lightweight Three.js simulation that visualizes a swarm of military drones using simple graphics. The simulation demonstrates basic swarm behavior including cohesion (attraction to target), separation (avoiding other drones), and obstacle avoidance.

## Features

- Drones represented as colored spheres with smooth movement
- Target (red sphere) that moves within the environment
- Static obstacles (gray blocks) that drones must avoid
- Interactive controls to adjust simulation parameters
- 3D camera controls to view the simulation from any angle

## Requirements

- Modern web browser with WebGL support
- Compatible with Windows 11 (WSL2) on systems with Ryzen 7 CPU, AMD Radeon Graphics, and NVIDIA GeForce RTX 3060 GPU

## How to Run

1. Ensure all files are in the correct directory structure:
   ```
   mil_drone_sim/
   ├── index.html
   ├── styles.css
   ├── js/
   │   └── main.js
   └── README.md
   ```

2. Simply open the `index.html` file in a web browser, or set up a local server:
   
   Using Python:
   ```bash
   cd mil_drone_sim
   python -m http.server
   ```
   
   Then navigate to `http://localhost:8000` in your browser.

## Simulation Controls

- **Drone Count**: Adjust the number of drones in the simulation
- **Cohesion**: Control how strongly drones are attracted to the target
- **Separation**: Control how strongly drones avoid each other
- **Obstacle Avoidance**: Control how strongly drones avoid obstacles
- **Reset Simulation**: Restart the simulation with current settings
- **Camera Controls**: 
  - Left-click and drag to rotate view
  - Right-click and drag to pan
  - Scroll to zoom

## How It Works

The simulation uses Three.js to create a 3D environment where drones follow a set of simple rules:

1. **Cohesion**: Each drone is attracted to the target (red sphere)
2. **Separation**: Drones maintain distance from each other to avoid collisions
3. **Obstacle Avoidance**: Drones detect and steer away from obstacles
4. **Boundary Enforcement**: Drones stay within the simulation boundaries

These simple rules combine to create complex swarm behavior that mimics how real drone swarms might navigate an environment.

## License

This project is open source and available for educational and demonstration purposes. 