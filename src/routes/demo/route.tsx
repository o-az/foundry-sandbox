import { Ref } from '@solid-primitives/refs'
import { createSignal, onMount } from 'solid-js'
import { createServerFn } from '@tanstack/solid-start'
import { createFileRoute } from '@tanstack/solid-router'
import { transformerNotationFocus } from '@shikijs/transformers'
import { createOnigurumaEngine, loadWasm } from 'shiki/engine/oniguruma'
import { createHighlighterCore, type ThemeRegistration } from 'shiki/core'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'

import { htmlCodeSnippet } from './-data/snippets.ts'

const generateCode = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    try {
      await loadWasm(import('shiki/onig.wasm'))

      const highlighter = await createHighlighterCore({
        themes: [import('@shikijs/themes/houston')],
        langs: [import('@shikijs/langs/tsx'), import('@shikijs/langs/html')],

        engine: createOnigurumaEngine(await import('shiki/wasm')),
      })

      const { default: idxTheme } = await import('./-data/theme.json', {
        with: { type: 'json' },
      })

      return highlighter.codeToHtml(htmlCodeSnippet.trimStart(), {
        lang: 'html',
        transformers: [transformerNotationFocus()],
        theme: idxTheme as ThemeRegistration,
      })
    } catch (error) {
      console.info('error in serverfn')
      console.error(error)
    }
  })

export const Route = createFileRoute('/demo')({
  component: RouteComponent,
  loader: () => generateCode(),
})

function RouteComponent() {
  const code = Route.useLoaderData()
  const [ref, setRef] = createSignal<Element | undefined>()

  onMount(() => {
    if (code() && typeof code() === 'string') ref()?.setHTMLUnsafe(`${code()}`)
  })

  return (
    <main class="pb-12 min-size-max flex items-center overflow-y-auto">
      <div class="min-size-max overflow-auto gap-y-4 flex flex-col w-[720px] items-center">
        <h1 class="text-2xl font-black text-center mt-18 sm:mt-12">
          Sandbox Embed Demo
        </h1>
        <Ref ref={setRef}>
          <article
            ref={ref}
            data-element="iframe-code-block"
            class="text-sm self-center shrink-0 w-full sm:max-w-2xl max-w-full"
          />
        </Ref>
        <div class="text-balance shrink-0">
          <p class="mt-4 max-w-3xl text-center">
            Fugiat culpa aute duis velit. Irure velit anim ut ad voluptate minim
            ex excepteur. Deserunt duis ex aliqua exercitation enim occaecat
            pariatur officia nostrud mollit laborum commodo.
          </p>

          <p class="mt-4 max-w-3xl text-center">
            Velit consectetur non sint. In excepteur pariatur excepteur ipsum
            fugiat sunt id dolore sit dolore pariatur laborum in officia. Ex
            sint enim ea qui dolor ullamco labore consequat Lorem exercitation.
            Laborum ut aliquip enim cillum voluptate do ullamco ex culpa ea
            consequat est. Officia nisi laboris quis dolore non nisi duis sint
            enim irure.
          </p>
        </div>
      </div>
    </main>
  )
}
