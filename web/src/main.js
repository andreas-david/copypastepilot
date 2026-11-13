import './app.css';
import { applyTheme, getTheme } from './theme.js';
import { mount } from 'svelte';
import App from './App.svelte';

applyTheme(getTheme()); // vor dem Zeichnen, damit nichts aufblitzt

mount(App, { target: document.getElementById('app') });
