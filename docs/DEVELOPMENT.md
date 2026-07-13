# Development

## Local Validation

The project has no runtime dependencies. It only requires Node.js 20 or newer.

```bash
npm test
```

The command:

1. Copies `src` to `dist`
2. Injects the version from `package.json`
3. Runs static and behavioral checks against the built card

## Development Cycle

1. Update `src/three-state-switch-card.js`
2. Bump the version in `package.json`
3. Run `npm test`
4. Verify the card in Home Assistant
5. Commit both `src` and `dist`

## Home Assistant Testing

For quick local testing, copy `dist/three-state-switch-card.js` into `/config/www`.
Load the resource with a cache-busting query string:

```text
/local/three-state-switch-card.js?v=0.1.0
```

## Before Publishing

- Set the GitHub description and topics:
  `home-assistant`, `lovelace`, `hacs`, `custom-card`
- Enable GitHub Issues
- Review README images and screenshots
- Verify the license and author metadata
- Run the `Validate` GitHub Actions workflow
- Create a proper GitHub Release, not only a tag

## Versioning and Release

Recommended flow:

```bash
npm version patch
npm test
git add .
git commit -m "Release v0.1.1"
git tag v0.1.1
git push --follow-tags
```

The `release.yml` workflow publishes the built `dist/three-state-switch-card.js`
bundle directly as the GitHub Release asset.
