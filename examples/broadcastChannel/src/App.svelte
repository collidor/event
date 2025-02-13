<script lang="ts">
  import { onMount } from 'svelte';
  import svelteLogo from './assets/svelte.svg'
  import { eventBus } from './eventBus';
  import { HiEvent } from './hiEvent';
  import viteLogo from '/vite.svg'

  let message = $state('')

  const incommingMessages = $state<string[]>([])

  function publish() {
    eventBus.emit(new HiEvent(message))
  }

  onMount(() => {
    eventBus.on(HiEvent, (event) => {
        incommingMessages.push(event)
    })
  })
</script>

<main>
  <h1>EventBus + BroadcastChannel</h1>

  <div class="card">
    <input type="text" bind:value={message} placeholder="Type a message" />
    <button type="button" onclick={publish}>Send</button>
    <hr>

    <h2>Messages:</h2>
    <ul>
      {#each incommingMessages as msg}
        <li>{msg}</li>
      {/each}
    </ul>
  </div>
</main>
