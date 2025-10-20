/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "semantic-release-vsce",
      {
        "packageVsix": true,
      }
    ],
    [
      "@semantic-release/github",
      {
        "assets": [
          {
            "path": "*.vsix"
          }
        ]
      }
    ]
  ]  
};
