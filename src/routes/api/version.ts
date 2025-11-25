import { createFileRoute } from '@tanstack/solid-router'

import { name, version } from '~build/package'
import { sha, github, authorDate, commitMessage } from '~build/git'

export const Route = createFileRoute('/api/version')({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          name,
          github,
          rev: {
            sha,
            date: authorDate,
            message: commitMessage,
            link: `${github}/commit/${sha}`,
          },
          packageJsonVersion: version,
        }),
    },
  },
})
