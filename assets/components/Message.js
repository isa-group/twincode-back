export default {
  template: `
  <div class="flex mb-1 mt-1" :class="mine ? 'justify-end' : 'justify-start'">
    <div class="flex-shrink-0" v-if="!mine"><img class="rounded-full w-12 h-12" :src="girl ? '/static/img/avatar_girl.svg' : '/static/img/avatar_boy.svg'" /></div>
    <div class="flex-inital p-3 border rounded-t-lg" :class="mine ? 'rounded-bl-lg bg-white' : 'rounded-br-lg bg-teal-200'">
        <p class="break-words">{{ message }}</p
    </div>
  </div>
  `,
  props: {
    mine: true,
    message: "",
    girl: true,
  },
};
