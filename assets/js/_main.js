/* ==========================================================================
   jQuery plugin settings and other scripts
   ========================================================================== */

$(document).ready(function(){
   // Sticky footer
  var bumpIt = function() {
      $("body").css("margin-bottom", $(".page__footer").outerHeight(true));
    },
    didResize = false;

  bumpIt();

  $(window).resize(function() {
    didResize = true;
  });
  setInterval(function() {
    if (didResize) {
      didResize = false;
      bumpIt();
    }
  }, 250);
  // FitVids init
  $("#main").fitVids();

  // Keep overflow navigation disclosure state available to assistive technology.
  var $navToggle = $("#site-nav > button"),
    $overflowNav = $("#site-nav .hidden-links"),
    syncNavigationDisclosure = function() {
      var expanded = !$navToggle.hasClass("hidden") && !$overflowNav.hasClass("hidden");
      $navToggle.attr("aria-expanded", expanded);
      $overflowNav.attr("aria-hidden", !expanded);
    };

  $navToggle.on("click", syncNavigationDisclosure);
  $(window).resize(syncNavigationDisclosure);
  syncNavigationDisclosure();

  // init sticky sidebar
  $(".sticky").Stickyfill();

  var $authorLinksButton = $(".author__urls-wrapper button"),
    $authorLinks = $(".author__urls"),
    setAuthorDisclosureState = function(expanded) {
      $authorLinksButton.attr("aria-expanded", expanded).toggleClass("open", expanded);
      $authorLinks.attr("aria-hidden", !expanded);
    };

  var stickySideBar = function(){
    var show = $authorLinksButton.length === 0 ? $(window).width() > 1024 : !$authorLinksButton.is(":visible");
    // console.log("has button: " + $(".author__urls-wrapper button").length === 0);
    // console.log("Window Width: " + windowWidth);
    // console.log("show: " + show);
    //old code was if($(window).width() > 1024)
    if (show) {
      // fix
      Stickyfill.rebuild();
      Stickyfill.init();
      $authorLinks.show();
      setAuthorDisclosureState(true);
    } else {
      // unfix
      Stickyfill.stop();
      $authorLinks.hide();
      setAuthorDisclosureState(false);
    }
  };

  stickySideBar();

  $(window).resize(function(){
    stickySideBar();
  });

  // Follow menu drop down

  $authorLinksButton.on("click", function() {
    var expanded = !$authorLinks.is(":visible");
    $authorLinks.stop(true, true).fadeToggle("fast");
    setAuthorDisclosureState(expanded);
  });

  // init smooth scroll
  $("a").smoothScroll({offset: -20});

  // add lightbox class to all image links
  $("a[href$='.jpg'],a[href$='.jpeg'],a[href$='.JPG'],a[href$='.png'],a[href$='.gif']").addClass("image-popup");

  // Magnific-Popup options
  $(".image-popup").magnificPopup({
    // disableOn: function() {
    //   if( $(window).width() < 500 ) {
    //     return false;
    //   }
    //   return true;
    // },
    type: 'image',
    tLoading: 'Loading image #%curr%...',
    gallery: {
      enabled: true,
      navigateByImgClick: true,
      preload: [0,1] // Will preload 0 - before current, and 1 after the current image
    },
    image: {
      tError: '<a href="%url%">Image #%curr%</a> could not be loaded.',
    },
    removalDelay: 500, // Delay in milliseconds before popup is removed
    // Class that is added to body when popup is open.
    // make it unique to apply your CSS animations just to this exact popup
    mainClass: 'mfp-zoom-in',
    callbacks: {
      beforeOpen: function() {
        // just a hack that adds mfp-anim class to markup
        this.st.image.markup = this.st.image.markup.replace('mfp-figure', 'mfp-figure mfp-with-anim');
      }
    },
    closeOnContentClick: true,
    midClick: true // allow opening popup on middle mouse click. Always set it to true if you don't provide alternative source.
  });

});
