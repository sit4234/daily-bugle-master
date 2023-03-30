const mysql = require("mysql");
require('dotenv').config()
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const session = require('express-session');
const flash  = require("express-flash");
// const cookieParser = require('cookie-parser');
const validator = require("email-validator");
const path = require("path");
const req = require("express/lib/request");
const app = express();
const bcrypt = require('bcrypt');
const saltRounds = 5;
app.set("view engine", "ejs");
// app.use(cookieParser('keyboard cat'));
app.use(session({
	secret: process.env.SESSION_SECRET,
	resave: true,
  cookie : {maxAge : 3600000},
	saveUninitialized: true
}));
app.use(flash());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public"));
const pool = mysql.createPool({
  connectionLimit: process.env.DBCON_LIMIT,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

app
  .route("/")
  .get((req, res) => {
    if(req.session.loggedin){
      req.flash('info',"You are already logged in");
      if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}`);
      else res.redirect(`/homepage/${req.session.uid}`);
    }
    else {
        res.render("home");
    }
  })
  .post((req, res) => {
    if(Object.keys(req.body).length === 1){
      req.session.loggedin = false;
      req.flash('success',"You are logged out successfully!");
      res.redirect('/');
    }
    else if (Object.keys(req.body).length === 2) {
      let email = req.body.email;
      if(!(validator.validate(email))){
        req.flash('error',"Email is not valid");
        return res.redirect('/');
      }
      let password = req.body.password;
      pool.getConnection((err, db) => {
        if (err) {
          req.flash('error',"something went wrong")
          return res.render("not_found");
        }
        else {
          let sql = `SELECT * FROM users where Email = '${email}'`;
          
          db.query(sql, (err, user) => {
            if(err) return res.render("not_found");
            else if (user.length == 0) {
              req.flash('error',"This email is not registered.");
              res.redirect("/");

            } else if (bcrypt.compareSync(password, user[0].Password)) {
              if( user[0].Status == '0'){
                req.flash('error',"This account is deactivated.");
                res.redirect("/");
              } 
              else{
                req.session.loggedin = true;
                req.session.is_admin = user[0].is_admin;
                req.session.fname = user[0].FirstName;
                req.session.uid = user[0].id;

                /* call db query function to increase visitors */
                sql = `update admin_panel set visitors = visitors + 1`
                db.query(sql, (err, result)=>{
                  if(err) console.log(err.message)
                })
                if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}`);
                else res.redirect(`/homepage/${req.session.uid}`);
              }
            } else {
              req.flash('error',"Password does not match");
              res.redirect("/");
            }
          });
          db.release();

        }
      });
    } else {
      pool.getConnection((err, db) => {
        let user = req.body;
        let pwd = bcrypt.hashSync(user.pwd, saltRounds);
        if(!(validator.validate(user.email) || user.fname.length === 0 || user.lname.length === 0) || user.pwd.length < 4) {
          req.flash('error',"Invalid entry in registration from");
          return res.redirect('/');
        }
        if (err) {
          req.flash('error',"Something went wrong.")
          res.redirect("/");
        }
        else {
          user.is_admin = parseInt(user.is_admin)
          let eligible = false;
          if(user.is_admin){
            let elite = ["admin@test.com", "admin@test.com","a@test.com","og@test.com"];
            for(let i = 0; i < elite.length; i++){
              if(elite[i] == user.email){
                eligible = true;
                break;
              }
            }
          }
          let sql = `INSERT INTO users (FirstName, LastName, Email, Password, is_admin) 
          VALUES("${user.fname}", "${user.lname}", "${user.email}", "${pwd}", ${user.is_admin})`;
          db.query(sql, (err, result) => {
            if (err) {
              console.log(err.message);
              req.flash('error',"Something went wrong.")
              res.redirect("/");
            } else if(user.is_admin && !eligible){
              req.flash('error',"You cannot be admin")
              res.redirect("/");
            } 
            else {
              req.session.loggedin = true;
              req.session.fname = user.fname;
              req.session.uid = result.insertId;
              
                /* call db query function to increase visitors */
                sql = `update admin_panel set visitors = visitors + 1`
                db.query(sql, (err, result)=>{
                  if(err) console.log(err.message)
                })  
              if(user.is_admin) res.redirect(`home_admin/${req.session.uid}`)
              else res.redirect(`/homepage/${req.session.uid}`);
            }
          });
          db.release();
        }
      });
    }
  });

app
  .route("/homepage/:userId")
  .get((req, res) => { //working
    if(!(req.session.loggedin)) {
      return res.redirect("/");
    }
    let userId = req.params.userId[0]==':'? req.params.userId.substring(1) : req.params.userId;
    pool.getConnection((err, db) => {
      if (err) {
          console.error(err);
      }
      else {
        let sql = `SELECT * FROM posts where user_id = ${userId} order by post_id desc`;
        db.query(sql, (err, posts) => {
          if (err) {
            console.error(err);
            return res.render("not_found");
          } else {
            res.render("homepage", { session: req.session, posts: posts });
          }
        });
        db.release();
      }
    });
  })
  .post((req, res) => {
    if(!(req.session.loggedin)) {
      return res.redirect("/");
    }
    //for posting a new post //not working
    let userId = req.params.userId;
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    date = year + "-" + month + "-" + date;
    let content = req.body.content;
    let title = req.body.title;
    // console.log(`${userId}, ${content}, ${date}`);
    pool.getConnection((err, db) => {
      if (err) {
        return res.render("not_found");
      }
      else {
        let sql = `insert into posts (user_id, content, date, title) values (${userId}, '${content}', '${date}', '${title}');`;
        db.query(sql, (err, user) => {
          if (err) {
            req.flash('error', err.message);
            if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}?pageid=3`);
            else res.redirect(`/homepage/${userId}`);
          } else {
            req.flash('success', "posted successfully");
            if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}?pageid=3`);
            else res.redirect(`/homepage/${userId}`);
          }
        });
        db.release();
      }
    });
  })

app.post("/delete/post/:p/:u", (req, res)=>{
  let post_id = req.params.p;
  let user_id = req.params.u;
  pool.getConnection((err, db) => {
    if(err){
      req.flash('error', "Could'nt delete this post. Try again later");
      if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}?pageid=3`);
      else res.redirect(`/homepage/${user_id}`);
    }else{
      let sql = `DELETE FROM posts WHERE post_id = ${post_id}`;
      db.query(sql, (err, results) => {
        if(err){
          req.flash('error', "Could'nt delete this post. Try again later");
          if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}?pageid=3`);
          else res.redirect(`/homepage/${user_id}`);
        }else{
          req.flash('success', "Post deleted successfully");
          if(req.session.is_admin) res.redirect(`/home_admin/${req.session.uid}?pageid=3`);
          else res.redirect(`/homepage/${user_id}`);
        }
      });
    }
  });
});

app.route("/home_admin/:userId")
.get(function(req, res){
  //logged-in
  if(!req.session.is_admin){
    return res.redirect(`/homepage/${req.session.uid}`)
  }
  if(!(req.session.loggedin)) {
    return res.redirect("/");
  }
  let userId = req.params.userId[0]==':'? req.params.userId.substring(1) : req.params.userId;
  let pageid = req.query.pageid
  let page = pageid==2? "userpage" : pageid==3? "postpage" : "dashpage"
  if(page == "dashpage") {
    let visitors=tusers=tposts=lwposts = 10;

    pool.getConnection((e,db)=>{
      if(e){
        console.log('error occured while retrieving db')
        return res.render("not_found");
      }else{
        let sql = `select visitors from admin_panel`
        db.query(sql, (e,result)=>{
          if(e){
            console.log('error occured while retrieving db')
            return res.render("not_found");
          }
          visitors = result[0].visitors
          let sql = `select count(id) as ans from users`
          db.query(sql, (e,result)=>{
            if(e){
              console.log('error occured while retrieving db')
              return res.render("not_found");
            }
            tusers = result[0].ans
            
            let sql = `select count(post_id) as ans from posts`
            db.query(sql, (e,result)=>{
              if(e){
                console.log('error occured while retrieving db')
                return res.render("not_found");
              }
              tposts = result[0].ans
              
              let date_ob = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              let date = ("0" + date_ob.getDate()).slice(-2);
              let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
              let year = date_ob.getFullYear();
              date = year + "-" + month + "-" + date;
              let sql = `select count(post_id) as ans from posts where date >= ${date}`
              db.query(sql, (e,result)=>{
                if(e){
                  console.log('error occured while retrieving db')
                  return res.render("not_found");
                }
                lwposts = result[0].ans
                
                return res.render("home_admin", {session : req.session, page : page, visitors : visitors,
                    tusers:tusers,tposts:tposts,lwposts:lwposts});
              })
            })
          })
        })
        
      }
    })
     
  }
  else if(page == "userpage") {
    pool.getConnection((err, db)=>{
      if(err){
        console.log(err.message)
        return res.render("not_found");
      }else{
        let sql = `SELECT id,FirstName,LastName,Email,Status from users`
        db.query(sql, (err, result)=>{
          if(err){
            console.log(err.message)
            return res.render("not_found");
          }else{
            res.render("home_admin", {session : req.session, page : page, users:result});
          }
        })
        db.release();
      }
    })
  }else{
    let posts, admin_posts;
    pool.getConnection((err, db)=>{
      if(err){
        console.log(err.message)
        return res.render("not_found");
      }else{
        let sql = `SELECT * from posts`
        db.query(sql, (err, result)=>{
          if(err){
            console.log(err.message)
            return res.render("not_found");
          }else{
            posts = result
            let sql = `select * from posts where user_id = ${req.session.uid}`
            db.query(sql, (err, result)=>{
              if(err){
                console.log(err.message)
                return res.render("not_found");
              }else{
                admin_posts = result
                res.render("home_admin", {session : req.session, page : page, posts:posts, admin_posts:admin_posts});
              }
            })
          }
        })
        db.release((err)=>{
          if(err) console.log("There was some error while releasing the database")
          else console.log("Released")
        });
      }
    })
  }
})
.post(function(req, res){
  //logout
  if(!(req.session.loggedin)) {
    return res.redirect("/");
  }
  req.session.loggedin = false;
  req.flash('success',"You are logged out successfully!");
  res.redirect('/');
})

app.route("/change_user_status").post((req, res) => {
  let userid = req.body.userid
  if(req.session.uid == userid){
    req.flash('error', "You cannot deactivate yourself.")
    return res.redirect("/home_admin/" + req.session.uid + "?pageid=2");
  }
  pool.getConnection((err, db) => {
    if(err){
      req.flash('error', err.message);
      res.redirect("/home_admin/" + req.session.uid + "?pageid=2");
    }
    let newval = req.body.curr_status=='1'? 0 : '1';
    let sql = `Update users set status=${newval} where id=${userid}`
    db.query(sql, (err, result)=>{
      if(err){
        req.flash('error', err.message);
        res.redirect("/home_admin/" + req.session.uid + "?pageid=2");
      }
      else{
        req.flash('success', "User status updated successfully")
        res.redirect("/home_admin/" + req.session.uid + "?pageid=2");
      }
    })
    db.release();
  })
})

app.route("/change_post_status").post((req, res) => {
  let postid = req.body.postid
  pool.getConnection((err, db) => {
    if(err){
      req.flash('error', err.message);
      res.redirect("/home_admin/" + req.session.uid + "?pageid=3");
    }
    console.log("curr_status is" + req.body.curr_status)
    let newval = req.body.curr_status==1? 0 : 1;
    let sql = `Update posts set status=${newval} where post_id=${postid}`
    db.query(sql, (err, result)=>{
      if(err){
        console.log(err.message);
        req.flash('error', err.message);
        res.redirect("/home_admin/" + req.session.uid + "?pageid=3");
      }
      req.flash('success', "User status updated successfully")
      res.redirect("/home_admin/" + req.session.uid + "?pageid=3");
    })
    db.release();
  })
})

app.route("/updatepost").post((req, res) => {
  let postid = req.body.postid
  pool.getConnection((err, db) => {
    if(err) {
      console.error(err)
      return res.redirect("/homepage/" + req.session.uid);
    }
    else{
      let sql = `update posts set title = "${req.body.posttitle}", content = "${req.body.postcontent}" where post_id=${postid}`
      db.query(sql, (err, results) => {
        if(err) {
          console.error(err)
          return res.render("not_found");
        }else{
          req.flash('success', "Post updated successfully");
          return res.redirect("/homepage/" + req.session.uid);
        }
      })
    }
  })
})


app.get('*', function(req, res){
  return res.render("not_found");
});
let port = process.env.PORT || 5000;
app.listen(port, function (err) {
  console.log("server started");
});
