import express from "express"
import 'dotenv/config'
import bodyParser from "body-parser"
import pg from "pg"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import cookieParser from "cookie-parser"
import cors from "cors"
import multer from "multer"
import { S3Client, PutObjectCommand,GetObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto"





const app = express()
// Multer for uploading images
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })
// AWS Bucket 
const bucketName = "elevate-estates"
const bucketRegion = process.env.bucketRegion
const bucketAccessKey = process.env.bucketAccessKey
const bucketSecretKey = process.env.bucketSecretKey
const s3 = new S3Client({
    credentials:{
        accessKeyId:bucketAccessKey,
        secretAccessKey:bucketSecretKey
    },
    region:bucketRegion
})



app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
var corsOptions = {
    origin: 'https://elevate-estate-frontend.onrender.com',
    credentials: true, // Important for cookies, authorization headers with HTTPS
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
    "Origin",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Request-With",
    ],
    
   }
app.use(cors(corsOptions))


const port = 8080
const saltRounds = 15
const tokenSecret = "anray"

const db = new pg.Client({
    user     : process.env.RDS_USERNAME,
    host     : process.env.RDS_HOSTNAME,
    database: "postgres",
    password : process.env.RDS_PASSWORD,
    port     : process.env.RDS_PORT,
    ssl: true
    
})

try {
    db.connect().then(
        console.log("Connected to DB success")          
    )
} catch (error) {
    console.log(error);
}

const users_table = "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY , name VARCHAR(255),surname VARCHAR(255),email VARCHAR(255) UNIQUE,password VARCHAR(255),wishlist_listing_id TEXT[],favourite_listing_id TEXT[]);"
const agents_table= "CREATE TABLE IF NOT EXISTS agents (id SERIAL PRIMARY KEY , name VARCHAR(255),surname VARCHAR(255),email VARCHAR(255) UNIQUE,password VARCHAR(255), profile_img TEXT, mobile VARCHAR(255), description VARCHAR(1000000), years_of_experience INT, company VARCHAR(255),wishlist_listing_id TEXT[],favourite_listing_id TEXT[]);"
const listings_table= "CREATE TABLE IF NOT EXISTS listings (id SERIAL PRIMARY KEY ,agent_id VARCHAR(255), images TEXT[], city VARCHAR(255), suburb VARCHAR(255), number_of_beds INT, number_of_baths INT, number_of_garages INT, pet_friendly VARCHAR(225), price INT,rent_or_buy VARCHAR(255),description VARCHAR(1000000))"
db.query(users_table+agents_table+listings_table, (err,res) =>{
    if (err) {
      console.error("Error executing query", err.stack);
    } 
  })




function authenticateToken(req,res,next){
    const token = req.cookies.token
    console.log(req.headers)
    

    if (token == null) {
      
        req.user = "No token"
        next()
    } else {
        jwt.verify(token,tokenSecret,(err,result)=>{
            if (err) {
                res.send("Invalid token")
            } else {
                req.user = result.user
                next()
            }
        })
    }
}

app
.get("/agents",authenticateToken, (req,res)=>{
   
    if (req.user == "No token") {
        res.send("No token")
    } else {
       db.query("SELECT * FROM agents ",(err,data) =>{
        if (err) {
            console.log(err);
        } else {
            res.send(data.rows)
        }
       })
    }
})

.get("/my-profile",authenticateToken, (req,res)=>{
    
    if(!req.user.years_of_experience){
        db.query("SELECT * FROM users WHERE id = $1",[req.user.id],(err,data) =>{
            if (err) {
                console.log(err);
            } else {
                res.send([data.rows])
            }
           })
    }else{
            db.query("SELECT * FROM agents WHERE id = $1 ",[req.user.id],(err,data) =>{
            if (err) {
                console.log(err);
            } else {
                var dataArray =[]
                db.query("SELECT * FROM listings WHERE agent_id = $1",[req.user.id],(err,data) =>{
                    if (err) {
                        console.log(err);
                    } else {
                        dataArray.push(data.rows)
                        res.send(dataArray)
                    }
                })
                dataArray.push(data.rows)
            }
        })
    }
})
.get("/profile/:id",(req,res)=>{
    var dataArray= []
    db.query("SELECT * FROM agents WHERE id = $1",[req.params.id],(err,data) =>{
        if (err) {
            console.log(err);
        } else {
            db.query("SELECT * FROM listings WHERE agent_id = $1",[req.params.id],(err,data) =>{
                dataArray.push(data.rows)
                res.send(dataArray)
                console.log(data.rows);
            })
            dataArray.push(data.rows)
        }
    })
})
.get("/check-auth",authenticateToken,(req,res)=>{
    res.send(req.user)
})
.get("/listing/:id",(req,res)=>{
    db.query("SELECT * FROM listings WHERE id = $1",[req.params.id],(err,data)=>{
        if (err) {
            res.send(err)
        } else {
            res.send(data.rows[0])
        }
    })
    console.log(req.params);

})
.get("/listings",async (req,res)=>{
    const data = await db.query("SELECT * FROM listings")
    res.send(data.rows)
})
.get("/listing/:city/:nob/:nobaths/:rob/:price",async (req,res)=>{
    console.log(req.params);
    const {city,nob,nobaths,rob,price} = req.params
    if (city == "any" && nob == "any" && nobaths == "any" && rob == "any" && price == "any" ) {
        const data = await db.query("SELECT * FROM listings")
        res.send(data.rows)
    } else {
        var string = "SELECT * FROM listings WHERE "
        if (city == "any") {
            string += "city IS NOT NULL"
        } else {
            string += `city = '${city}'`
        }
        if (nob == "any") {
            string += " AND number_of_beds IS NOT NULL"
        } else {
            string += ` AND number_of_beds = '${nob}'`
        }
        if (nobaths == "any") {
            string += " AND number_of_baths IS NOT NULL"
        } else {
            string += ` AND number_of_baths = '${nobaths}'`
        }
        if (rob == "any") {
            string += " AND rent_or_buy IS NOT NULL"
        } else {
            string += ` AND rent_or_buy = '${rob}'`
        }
        if (price == "any") {
            string += " AND price IS NOT NULL"
        } else {
            string += ` AND price = '${price}'`
        }
        db.query(string,(err,data)=>{
            if (err) {
                res.send(err)
            } else {
                res.send(data.rows)
            }
        })
        
    }
    
})

.get("/logout",(req,res)=>{
    res.clearCookie("token")
    res.redirect("https://elevate-estate-frontend.onrender.com")
})

.post("/signup",upload.single('image'), (req,res)=>{
    bcrypt.hash(req.body.password, saltRounds, function(err, hash) {         //Hash the password
                                        
        if (req.body.years_of_experience >= 0){                              //Check whether the person is a user or an agent
            const imageName = crypto.randomBytes(34).toString('hex')

            const params = {
                Bucket: bucketName,
                Key:imageName,
                Body:req.file.buffer,
                ContentType:req.file.mimetype
                }

            const command = new PutObjectCommand(params)
            s3.send(command)
            console.log(imageName);
            const imageFileName = "https://elevate-estates.s3.ap-southeast-2.amazonaws.com/"+imageName            
            
           db.query("INSERT INTO agents (name,surname,email,password,profile_img,mobile,description,years_of_experience,company) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);",
                [req.body.name, req.body.surname, req.body.email, hash, imageFileName, req.body.number, req.body.description, req.body.years_of_experience, req.body.company],
                (err) => {
                    if (err) {
                        res.send(err.detail)
                    } else {
                        db.query("SELECT * FROM agents WHERE email = $1",[req.body.email],(err,data)=>{
                            const userInfo = data.rows[0]
                            const token = jwt.sign({user: userInfo},tokenSecret)
                            res.cookie("token",token,{
                                httpOnly:true,
                                maxAge:3000000000
                            })
                            res.redirect("https://elevate-estate-frontend.onrender.com")
                        })
                    }
                }
            )
        }else{                                    //User
            db.query("INSERT INTO users (name,surname,email,password) VALUES ($1,$2,$3,$4)",
                [req.body.email,req.body.surname,req.body.email,hash],
                (err) =>{
                    if (err) {
                        res.send(err.detail);
                    }else{
                        db.query("SELECT * FROM users WHERE email = $1",[req.body.email],(err,data)=>{
                            const userInfo = data.rows[0]
                            const token = jwt.sign({user: userInfo},tokenSecret)
                            res.cookie("token",token,{
                                httpOnly:true,
                                maxAge:3000000000
                            })
                            res.redirect("https://elevate-estate-frontend.onrender.com")
                        })
                    }
                }
            )          
        }  
        
        
    })



               
})
.post("/login",async (req,res)=>{
    var userInfo = ""
    db.query("SELECT * FROM users WHERE email = $1",[req.body.email],(err,data)=>{
        if (err){
            console.log(err);
        }else{
            if (data.rows.length == 0) {                                                       //If no users where found,means login as Agent
                db.query("SELECT * FROM agents WHERE email = $1",[req.body.email],(err,data)=>{  
                    if (err){
                        console.log(err);
                    }else{
                        if(data.rows.length == 0){
                            res.send("Email not found,please register")
                        }else{
                            userInfo = data.rows[0]
                            console.log(userInfo);
                            bcrypt.compare(req.body.password, userInfo.password, function(err, result) {
                                if (err){
                                    res.send(err)
                                }else{
                                    
                                    if (result == true){
                                        const token = jwt.sign({user: userInfo},tokenSecret)
                                        res.cookie("token",token,{
                                            httpOnly:true,
                                            maxAge:3000000000
                                        })
                                        res.redirect("https://elevate-estate-frontend.onrender.com/my-profile")
 
                                    }else{
                                        res.send("Password incorrect")
                                    }
                                }
                            });
                        }
                    }
                })
            }else{
                userInfo = data.rows[0]
                bcrypt.compare(req.body.password, userInfo.password, function(err, result) {
                    if (err){
                        res.send(err)
                    }else{
                        if (result == true){
                            const token = jwt.sign({user: userInfo},tokenSecret)
                            res.cookie("token",token,{
                                httpOnly:true,
                                maxAge:3000000000
                            })
                            res.send(token)
                        }else{
                            res.send("Password incorrect")
                        }
                    }
                });

            }
        }
    })

})
.post("/new-listing",upload.array("images"),(req,res)=>{
    
    const listingImageArray = []

    req.files.forEach( (image)=>{
        const imageName = crypto.randomBytes(32).toString('hex')
        const params = {
            Bucket: bucketName,
            Key:imageName,
            Body:image.buffer,
            ContentType:image.mimetype
            }
        const command = new PutObjectCommand(params)
        s3.send(command)
        console.log(imageName);
        const imageUrl = "https://elevate-estates.s3.ap-southeast-2.amazonaws.com/"+imageName   
        listingImageArray.push(imageUrl)
        console.log(listingImageArray);
    })

    console.log(listingImageArray);
    db.query("INSERT INTO listings (images,city,suburb,number_of_beds,number_of_baths,number_of_garages,pet_friendly,price,rent_or_buy,description,agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[listingImageArray,req.body.city,req.body.suburb,req.body.number_of_beds,req.body.number_of_baths,req.body.number_of_garages,req.body.pet_friendly,req.body.price,req.body.rent_or_buy,req.body.description,req.body.agent_id],(err)=>{
        if (err) {
            console.log(err);
        }else{
            res.send("Success")
        }
    } )

})

.post("/add-to-wishlist",(req,res)=>{
    console.log(req);
    
})
.listen(port,()=>{
    console.log(`Server started on port ${port}`);
})