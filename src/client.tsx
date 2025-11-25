import { hydrate } from 'solid-js/web'
import { StartClient, hydrateStart } from '@tanstack/solid-start/client'

void hydrateStart().then(router => {
  void hydrate(() => <StartClient router={router} />, document)
})
