# WP Lab — Local WordPress Development Environment for Linux

<p align="center">
  <img src="public/icon.png" alt="WP Lab local WordPress development environment" width="110">
</p>

<h3 align="center">Docker-powered WordPress & WooCommerce testing sandboxes for Linux</h3>

<p align="center">
  Run multiple isolated local WordPress sites side-by-side, switch PHP versions, test WooCommerce, inspect logs and email, capture live previews, and share temporary client links from one desktop app.
</p>

<p align="center">
  <strong>Current version: 0.8.0</strong> · Linux desktop app · Docker Compose · WordPress · WooCommerce
</p>

<p align="center">
  <a href="https://haseebgb92.github.io/WP-Lab/">Website</a> ·
  <a href="https://github.com/haseebgb92/WP-Lab/releases/tag/v0.8.0">Download v0.8.0</a> ·
  <a href="https://github.com/haseebgb92/WP-Lab/issues">Issues</a>
</p>

![WP Lab local WordPress development dashboard](docs/images/wp-lab-dashboard.png)

## What is WP Lab?

**WP Lab is a local WordPress development environment for Linux** built for developers who need fast, disposable WordPress and WooCommerce test sites without manually maintaining separate Docker projects.

Each sandbox has its own WordPress install, database, files, PHP version, email inbox, ports, logs, frontend preview, and optional public client link. You can run several local WordPress sites at the same time and manage them from a single interface.

WP Lab is useful for:

- local WordPress theme development
- WordPress plugin testing
- WooCommerce development and checkout testing
- testing themes/plugins across multiple PHP versions
- reproducing client issues in isolated environments
- local email testing with Mailpit
- temporary client previews without deploying a staging server

## Features

- **Multiple isolated WordPress instances** — run several local WordPress/WooCommerce sandboxes at once.
- **Normal WP Admin workflow** — install themes and plugins directly from WordPress.
- **PHP version switching** — test the same site on PHP **8.2, 8.3, and 8.4** without losing WordPress data.
- **WooCommerce testing environment** — automatic WooCommerce setup plus demo products, orders, shipping, and test payment states.
- **Live site snapshots** — every instance can display a cached frontend screenshot with manual refresh.
- **Local email testing** — WordPress and WooCommerce emails are captured in a per-instance Mailpit inbox and are not sent externally.
- **Built-in logs** — inspect WordPress/Apache, `debug.log`, database, and email-catcher logs.
- **One-click cache clearing** — flush WordPress cache, transients, and relevant WooCommerce caches.
- **Instance controls** — rename, start/repair, stop, restart, delete, and reset themes/plugins.
- **Open local files** — jump directly into the instance files from WP Lab.
- **Temporary HTTPS client previews** — create a Cloudflare Tunnel link for reviews and stop sharing when finished.
- **Dummy WooCommerce payment gateway** — test success, failed, pending, and on-hold order outcomes.
- **Demo content generator** — quickly add sample blog posts, products, and orders.

## WordPress local development on Linux

WP Lab is designed specifically around a Linux desktop workflow. Instead of configuring Apache, PHP, MySQL, virtual hosts, and separate Docker Compose files for every project, WP Lab creates and manages isolated WordPress development environments for you.

It is currently suited to Ubuntu/Linux Mint-style systems with Docker Engine and Docker Compose installed.

### Run multiple local WordPress sites

Each WP Lab instance receives separate ports, persistent WordPress files, its own database, Mailpit inbox, logs, PHP version, and optional public preview. This makes it practical to test multiple themes, plugins, client sites, or PHP configurations side-by-side.

### Test WordPress across PHP versions

Use the built-in PHP selector to switch an existing sandbox between PHP 8.2, 8.3, and 8.4. WP Lab recreates the WordPress container while keeping the site data intact, making compatibility testing much faster than rebuilding a local stack for each PHP version.

### Local WooCommerce testing environment

WP Lab can prepare a WooCommerce sandbox with test data and development-friendly payment/shipping options. This makes it useful for testing store themes, checkout flows, order statuses, emails, plugins, and WooCommerce customizations without touching a production store.

## WP Lab vs wp-env and manual Docker Compose

WP Lab is not intended to replace every WordPress development tool. It is aimed at developers who prefer a visual, reusable environment manager for multiple disposable sites.

| Capability | WP Lab | wp-env | Manual Docker Compose |
| --- | --- | --- | --- |
| Graphical desktop interface | Yes | No | No |
| Multiple managed WordPress instances | Yes | Project-based | Manual |
| PHP 8.2 / 8.3 / 8.4 switching | Built in | Configurable | Manual |
| Per-site email catcher | Built in | Manual/configurable | Manual |
| WordPress/WooCommerce logs in UI | Built in | CLI/files | Manual |
| Frontend preview thumbnails | Built in | No | Manual |
| Temporary client preview link | Built in | Manual | Manual |
| WooCommerce demo/test workflow | Built in | Requires setup | Manual |
| Linux-focused desktop workflow | Yes | Cross-platform CLI | Depends on setup |

If you prefer a command-line-first project environment, `wp-env` may be a better fit. If you want full infrastructure control, manual Docker Compose remains the most flexible option. WP Lab focuses on reducing repetitive setup and management work.

## Screenshots

### WP Lab dashboard

![WP Lab WordPress Docker development environment](docs/images/wp-lab-dashboard.png)

### Built-in workflow guide

![WP Lab WordPress testing environment guide](docs/images/wp-lab-how-it-works.png)

## How WP Lab works

Each WordPress sandbox is isolated using Docker Compose. WP Lab assigns separate ports and persistent data for WordPress, the database, and Mailpit, then manages the environments through its desktop interface.

The first instance starts at:

- WordPress: `http://localhost:8085`
- WP Admin: `http://localhost:8085/wp-admin`
- WP Lab UI: `http://localhost:4173`

Additional instances receive their own ports automatically.

Default local WordPress credentials are:

```text
Username: admin
Password: admin
```

These credentials are intentionally simple because WP Lab is designed for **local disposable WordPress development environments only**.

## Requirements

- Linux — intended for Ubuntu / Linux Mint-style environments
- Node.js 20+
- npm
- Docker Engine
- Docker Compose plugin
- Google Chrome or Chromium for automatic frontend screenshots

The optional public-preview workflow uses Cloudflare Tunnel support.

## Install WP Lab on Linux

### Download the Debian package

Prebuilt Linux packages are available from the **GitHub Releases** section of this repository.

### Run from source

```bash
git clone https://github.com/haseebgb92/WP-Lab.git
cd WP-Lab
npm install
npm start
```

Then open:

```text
http://localhost:4173
```

To run the Electron desktop shell:

```bash
npm run app
```

## Build the Linux package

```bash
npm install
npm run build:linux
```

The generated Debian package is written to the `dist/` directory.

## Install Docker on Ubuntu / Linux Mint

A typical Docker installation is:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"
```

Log out and back in once so the Docker group change takes effect.

If `docker-compose-v2` is unavailable in your distribution repository, install Docker Engine and the Compose plugin from Docker's official repository.

## Typical WordPress testing workflow

1. Create a new WordPress instance and give it a useful name.
2. Open **WP Admin**.
3. Install the theme or plugin you want to develop/test.
4. Add WooCommerce and demo content when needed.
5. Test compatibility against PHP 8.2, 8.3, or 8.4.
6. Check logs, captured email, frontend snapshots, and WooCommerce behavior.
7. Create a temporary **Client Link** when someone else needs to review the site.
8. Restart, clear caches, reset themes/plugins, or delete the sandbox when finished.

## FAQ

### What is a local WordPress development environment?

A local WordPress development environment runs WordPress on your own computer instead of a public web server. Developers use local environments to build themes/plugins, test WooCommerce, reproduce bugs, and experiment safely before deploying changes.

### Can WP Lab run multiple local WordPress sites?

Yes. WP Lab can run multiple isolated WordPress instances at the same time. Each instance has separate WordPress files, database data, ports, PHP configuration, email catcher, and logs.

### Can I use WP Lab for WooCommerce development?

Yes. WP Lab is designed for both WordPress and WooCommerce testing. It includes WooCommerce setup helpers, demo products/orders, local email capture, shipping configuration, and a dummy payment gateway for testing different order outcomes.

### Can I test WordPress plugins on different PHP versions?

Yes. An existing sandbox can switch between PHP 8.2, 8.3, and 8.4 while preserving its WordPress data.

### Does WP Lab work on Ubuntu and Linux Mint?

WP Lab is Linux-focused and is developed around Ubuntu/Linux Mint-style desktop environments using Docker Engine and Docker Compose.

### Can I share a local WordPress site with a client?

Yes. WP Lab can create a temporary HTTPS client preview link using Cloudflare Tunnel. The link can be stopped directly from WP Lab when the review is finished.

### Is WP Lab a replacement for staging hosting?

No. WP Lab is for local development and temporary testing. Production-like staging environments remain preferable for final deployment verification, production integrations, and real customer data.

## Safety

WP Lab is a development tool, not a production hosting stack.

- Do not expose the default WordPress credentials directly to the public Internet.
- Treat temporary client links as short-lived review URLs.
- Do not use the dummy payment gateway for real transactions.
- Keep production secrets and customer data out of disposable test instances.

## Project status

WP Lab is actively evolving. Version **0.8.0** focuses on making local WordPress and WooCommerce testing feel more like managing lightweight disposable environments than manually maintaining separate local installations.

Issues, bug reports, feature requests, and practical improvement ideas are welcome through GitHub Issues.

---

Built by **Advertpreneur** for faster WordPress and WooCommerce development workflows.
