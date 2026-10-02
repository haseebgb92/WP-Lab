# WP Lab

Local disposable WordPress + WooCommerce testing environment.

## Current features
- Upload/replace theme ZIP and plugin/extension ZIP
- Fresh WordPress sandbox in Docker
- WP Admin + frontend shortcuts
- Automatic WooCommerce install
- WP Lab dummy payment gateway: success / failed / pending / on-hold
- COD and bank transfer
- Pakistan test shipping zone with flat rate, free shipping and local pickup
- One-click sample blogs, products and orders
- One-click factory reset
- WordPress debug mode enabled

## Requirements
- Node.js 20+
- npm
- Docker Engine
- Docker Compose plugin

## Run
```bash
cd "$HOME/Downloads/WP Lab"
npm install
npm start
```
Open http://localhost:4173

WordPress runs at http://localhost:8085
WP Admin: http://localhost:8085/wp-admin
Login: admin / admin

## Install Docker on Ubuntu/Linux Mint
Run:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"
```
Then log out and back in once. If `docker-compose-v2` is unavailable on your Mint/Ubuntu repository, install Docker Engine + Compose plugin from Docker's official repository instead.

## Important
WP Lab is for local development only. The deliberately simple admin password and dummy payment gateway must never be exposed to the public Internet.
