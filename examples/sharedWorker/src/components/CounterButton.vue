<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { eventBus } from '../eventbus'
import { CounterUpdatedEvent } from '../events/counterUpdated.event'
import { CounterClickedEvent } from '../events/counterClicked.event'

const count = ref(0)

onMounted(() => {
  const abortController = new AbortController()
  eventBus.on(
    CounterUpdatedEvent,
    (event) => {
      console.log('CounterButton', event)
      count.value = event ?? 0
    },
    abortController.signal,
  )

  return () => {
    abortController.abort()
  }
})
</script>

<template>
  <h1>Current count {{ count }}</h1>
  <button @click="() => eventBus.emit(new CounterClickedEvent())">Counter</button>
</template>
