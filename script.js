"use strict";
const header=document.querySelector(".site-header");
const year=document.querySelector("#current-year");
const menuButton=document.querySelector(".mobile-menu-button");
const navigation=document.querySelector(".main-navigation");
if(year)year.textContent=String(new Date().getFullYear());
function updateHeader(){if(header)header.classList.toggle("is-scrolled",window.scrollY>18)}
updateHeader();window.addEventListener("scroll",updateHeader,{passive:true});
function closeMenu(){if(!menuButton||!navigation)return;menuButton.setAttribute("aria-expanded","false");navigation.classList.remove("is-open");document.body.classList.remove("menu-open")}
if(menuButton&&navigation){menuButton.addEventListener("click",()=>{const open=menuButton.getAttribute("aria-expanded")==="true";menuButton.setAttribute("aria-expanded",String(!open));navigation.classList.toggle("is-open",!open);document.body.classList.toggle("menu-open",!open)});navigation.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeMenu))}
const reveals=document.querySelectorAll(".reveal");
if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}})},{threshold:.1,rootMargin:"0px 0px -40px"});reveals.forEach(el=>observer.observe(el))}else{reveals.forEach(el=>el.classList.add("is-visible"))}
