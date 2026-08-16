## [4.3.5](https://github.com/collidor/event/compare/v4.3.4...v4.3.5) (2026-08-16)


### Bug Fixes

* **ci:** add dummy NPM_TOKEN to satisfy semantic-release preflight check for OIDC ([05cafc3](https://github.com/collidor/event/commit/05cafc3b5463aef50e64acd4d93e1da2f7b8d937))
* **ci:** decouple npm and jsr publish from semantic-release ([9c7e6bc](https://github.com/collidor/event/commit/9c7e6bca20d36fa2ff43b6385fafd357e49fafe3))
* **ci:** re-enable native semantic-release npm publishing for OIDC ([f19f348](https://github.com/collidor/event/commit/f19f348836011707144ad2d8f2c1da9378d76b4b))

## [4.3.4](https://github.com/collidor/event/compare/v4.3.3...v4.3.4) (2026-08-15)


### Bug Fixes

* **ci:** add --allow-dirty to jsr publish to ignore uncommitted lockfiles ([586bdc0](https://github.com/collidor/event/commit/586bdc083ca81ff9a079ebf96dfcee26a80c83ca))

## [1.0.1](https://github.com/collidor/event/compare/v1.0.0...v1.0.1) (2026-08-15)


### Bug Fixes

* **ci:** rename workflow file to publish.yml to match npm trusted publisher configuration ([b7f0969](https://github.com/collidor/event/commit/b7f0969082b58eec878e6ef67d9b7b9c139117ec))

# 1.0.0 (2026-08-15)


### Bug Fixes

* add extension to PortChannel ([b25e9eb](https://github.com/collidor/event/commit/b25e9eb9aa1116322860c86a7e8752fd8a9fb27b))
* add initial buffer to events ([a6aa4a0](https://github.com/collidor/event/commit/a6aa4a09c41151d7d8cf330db927b189a31ef510))
* **build:** add @swc/core devDependency required for tsup es5 build target ([114a2a1](https://github.com/collidor/event/commit/114a2a12515bde1275907c671491f9a099b456f0))
* change type file and fix readme ([7ea7526](https://github.com/collidor/event/commit/7ea752643eb98d41360ed74dd1378ed5b0436c0e))
* **Channel:** make publish accept event name and data instead of Event instance ([d65c47d](https://github.com/collidor/event/commit/d65c47d6816819fb45b65a9592ba1dab31c13d48))
* **ci:** configure npmPublish false and provenance publishCmd for tokenless npm OIDC, fix repo URL format ([e68f9ea](https://github.com/collidor/event/commit/e68f9ea1b825de1c691a49d5b7236781ac9d2194))
* **ci:** update release pipeline to use OIDC trusted publishing without tokens ([37a4226](https://github.com/collidor/event/commit/37a422698576628c5fb3b90b1a4436bd8e8a1c1b))
* missing dataEvent on subscribe ([c396cc1](https://github.com/collidor/event/commit/c396cc1e86143f09ca1327029218197b41636348))
* port unsubscription ([9b27365](https://github.com/collidor/event/commit/9b27365d2d147b42b729a6a2c9ad71bbd6ab23e6))
* port unsubscription ([09d8739](https://github.com/collidor/event/commit/09d8739361c9c4e9e651445f87038371200da0b7))
* PortChannel onmessage ([cde058b](https://github.com/collidor/event/commit/cde058be7661e3f263034d60bb0efe8275499cc3))
* remove mandatory context type ([153e072](https://github.com/collidor/event/commit/153e07278af45e6634c1a3cb6a59d8a0cc48a458))
* removing port for all subscriptions once one is removed ([86ce134](https://github.com/collidor/event/commit/86ce134f1815801ac29f1cd7f36df6efd2bd0d7f))
* wrong publish type ([68e8054](https://github.com/collidor/event/commit/68e8054b5ba1cb5c893e6a30a7e1ec0383c64d60))


### Features

*  improve logging ([2a3f528](https://github.com/collidor/event/commit/2a3f528a48b93685e526cc56126a700c7a5778d9))
* add automated semantic-release pipeline for npm and jsr ([2f25aa1](https://github.com/collidor/event/commit/2f25aa1f80d5fca017c55b2e8983be6cb36e0b1c))
* create broadcastPublishingChannel ([c7b0f7f](https://github.com/collidor/event/commit/c7b0f7f81aef08f18426bc40a4429502f287cc7d))
* custom serializer and listen to multiple events ([0478934](https://github.com/collidor/event/commit/0478934920bdca0222a2a0df4999dabfec12ce46))
* enable events for single consumers ([6aa7ab9](https://github.com/collidor/event/commit/6aa7ab905813c98d454aab104af35528af959a5b))

# @collidor/event

## 4.3.3

### Patch Changes

- fix imports

## 4.3.2

### Patch Changes

- Add observable event

## 4.3.1

### Patch Changes

- Create result and fix dependencies sync

## 4.3.0

### Minor Changes

- Add cleanup callback to event.on return

## 4.2.13

### Patch Changes

- update tsup and export injector register type

## 4.2.12

### Patch Changes

- Reupload

## 4.2.11

### Patch Changes

- add schema toolkit

## 4.2.10

### Patch Changes

- publish

## 4.2.9

### Patch Changes

- publish test

## 4.2.8

### Patch Changes

- test publish

## 4.2.7

### Patch Changes

- 09d97fb: publish test
- publish test

## 4.2.6

### Patch Changes

- 17c8fc2: publish test
- publish

## 4.2.5

### Patch Changes

- publish

## 4.2.4

### Patch Changes

- 750cba9: publish

## 4.2.3

### Patch Changes

- publish

## 4.2.2

### Patch Changes

- publish
- 9f45da4: publish
