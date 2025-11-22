import { createFileRoute } from '@tanstack/solid-router'

import now from '~build/time'
import {
  github,
  branch,
  sha,
  abbreviatedSha,
  tag,
  lastTag,
  committer,
  committerDate,
  author,
  authorDate,
  commitMessage,
} from '~build/git'
import { name as ciName } from '~build/ci'
import { name, version } from '~build/package'

export const Route = createFileRoute('/api/version')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          now,
          github,
          branch,
          sha,
          abbreviatedSha,
          tag,
          lastTag,
          committer,
          committerDate,
          author,
          authorDate,
          commitMessage,
          ciName,
          name,
          version,
        }),
    },
  },
})
