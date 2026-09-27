# personomic

A platform for individualized precision neuroinformatics and biosignal experiments

## Running it

An Expo app for iOS, Android and the web.

```
yarn web        # in a browser
yarn ios        # prebuild output must exist; run `npx expo prebuild` first
yarn android
```

`StreamMonitor` from `@neurodevs/react-biosensors` renders DOM elements, so
for now the app only renders correctly on the web.
