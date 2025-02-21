<script setup lang="ts"></script>

<template>
  <main>
    <div>
      <h1>Iframe 1</h1>
      <iframe src="http://localhost:5173/counter"></iframe>
    </div>
    <div>
      <h1>Iframe 2</h1>
      <iframe src="http://localhost:5173/counter"></iframe>
    </div>
  </main>
</template>

<style scoped>
main {
  display: flex;
  justify-content: space-around;

  div {
    flex: 1;
  }
}

iframe {
  width: 100%;
  height: 100%;
}
</style>
