/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        "releaseRules": [
          { "type": "docs", "scope": "README", "release": "patch" }
        ]
      }
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/npm",
      {
        "npmPublish": false
      }
    ],
    "@semantic-release/git",
    "semantic-release-stop-before-publish",
  ]
};
